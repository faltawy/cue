use crate::normalize::normalize_chars;
use crate::{SearchSectionKind, Snippet, SnippetSegment};

const LEADING_CONTEXT: usize = 40;
const ELLIPSIS: &str = "…";

struct Folded<'a> {
    text: &'a str,
    chars: Vec<char>,
    sources: Vec<usize>,
}

impl<'a> Folded<'a> {
    fn new(text: &'a str) -> Self {
        let mut chars = Vec::with_capacity(text.len());
        let mut sources = Vec::with_capacity(text.len());
        normalize_chars(text, |folded, offset| {
            chars.push(folded);
            sources.push(offset);
        });
        Self {
            text,
            chars,
            sources,
        }
    }

    fn source(&self, index: usize) -> usize {
        self.sources.get(index).copied().unwrap_or(self.text.len())
    }

    fn slice(&self, start: usize, end: usize) -> &'a str {
        &self.text[self.source(start)..self.source(end)]
    }

    fn find(&self, needle: &[char], from: usize) -> Option<usize> {
        if needle.is_empty() || needle.len() > self.chars.len() {
            return None;
        }
        (from..=self.chars.len() - needle.len())
            .find(|&start| self.chars[start..start + needle.len()] == *needle)
    }

    fn occurrences(&self, needle: &[char], start: usize, end: usize) -> Vec<(usize, usize)> {
        let mut ranges = Vec::new();
        let mut from = start;
        while let Some(position) = self.find(needle, from) {
            if position + needle.len() > end {
                break;
            }
            ranges.push((position, position + needle.len()));
            from = position + needle.len();
        }
        ranges
    }
}

pub(crate) struct Matches {
    pub title: Option<Snippet>,
    pub body: Option<(Option<SearchSectionKind>, Snippet)>,
}

pub(crate) fn query_terms(phrases: &[&str], terms: &[&str]) -> Vec<Vec<char>> {
    let mut folded_terms: Vec<Vec<char>> = Vec::new();
    for raw in phrases.iter().chain(terms) {
        let trimmed = raw.trim_matches(|c: char| !c.is_alphanumeric());
        let mut folded = Vec::new();
        normalize_chars(trimmed, |c, _| folded.push(c));
        if !folded.is_empty() && !folded_terms.contains(&folded) {
            folded_terms.push(folded);
        }
    }
    folded_terms
}

// Snippets come from a substring match on the folded text rather than from
// the n-gram index, so a hit whose n-grams only scatter across the note gets
// no snippet instead of a highlight on every matching letter.
pub(crate) fn find_matches(
    terms: &[Vec<char>],
    title: &str,
    bodies: &[(Option<SearchSectionKind>, &str)],
    max_chars: usize,
) -> Matches {
    let none = Matches {
        title: None,
        body: None,
    };
    if terms.is_empty() {
        return none;
    }

    let title = Folded::new(title);
    let title_hits: Vec<Option<usize>> = terms.iter().map(|term| title.find(term, 0)).collect();
    let bodies: Vec<(Option<SearchSectionKind>, Folded, Vec<Option<usize>>)> = bodies
        .iter()
        .filter(|(_, text)| !text.trim().is_empty())
        .map(|(kind, text)| {
            let folded = Folded::new(text);
            let hits = terms.iter().map(|term| folded.find(term, 0)).collect();
            (*kind, folded, hits)
        })
        .collect();

    let every_term_found = (0..terms.len()).all(|index| {
        title_hits[index].is_some() || bodies.iter().any(|(_, _, hits)| hits[index].is_some())
    });
    if !every_term_found {
        return none;
    }

    let title_snippet = title_hits
        .iter()
        .any(Option::is_some)
        .then(|| highlight(&title, terms, 0, title.chars.len()));

    let mut best: Option<(
        usize,
        &(Option<SearchSectionKind>, Folded, Vec<Option<usize>>),
    )> = None;
    for body in &bodies {
        let found = body.2.iter().filter(|hit| hit.is_some()).count();
        if found > 0 && best.is_none_or(|(best_found, _)| found > best_found) {
            best = Some((found, body));
        }
    }
    let body_snippet = best.map(|(_, (kind, folded, hits))| {
        let first = hits.iter().flatten().copied().min().unwrap_or(0);
        (*kind, window(folded, terms, first, max_chars))
    });

    Matches {
        title: title_snippet,
        body: body_snippet,
    }
}

fn window(folded: &Folded, terms: &[Vec<char>], first: usize, max_chars: usize) -> Snippet {
    let len = folded.chars.len();
    let mut start = first.saturating_sub(LEADING_CONTEXT);
    while start > 0 && start < first && !folded.chars[start - 1].is_whitespace() {
        start += 1;
    }
    let mut end = (start + max_chars).min(len);
    if end < len {
        let mut boundary = end;
        while boundary > first && !folded.chars[boundary].is_whitespace() {
            boundary -= 1;
        }
        if boundary > first {
            end = boundary;
        }
    }

    let mut snippet = highlight(folded, terms, start, end);
    if start > 0 {
        snippet.segments.insert(
            0,
            SnippetSegment {
                text: ELLIPSIS.to_string(),
                highlighted: false,
            },
        );
    }
    if end < len {
        snippet.segments.push(SnippetSegment {
            text: ELLIPSIS.to_string(),
            highlighted: false,
        });
    }
    snippet
}

fn highlight(folded: &Folded, terms: &[Vec<char>], start: usize, end: usize) -> Snippet {
    let mut ranges: Vec<(usize, usize)> = terms
        .iter()
        .flat_map(|term| folded.occurrences(term, start, end))
        .collect();
    ranges.sort_unstable();
    let mut merged: Vec<(usize, usize)> = Vec::with_capacity(ranges.len());
    for (range_start, range_end) in ranges {
        match merged.last_mut() {
            Some(last) if range_start <= last.1 => last.1 = last.1.max(range_end),
            _ => merged.push((range_start, range_end)),
        }
    }

    let mut segments = Vec::with_capacity(merged.len() * 2 + 1);
    let mut cursor = start;
    for (range_start, range_end) in merged {
        push_plain(&mut segments, folded.slice(cursor, range_start));
        segments.push(SnippetSegment {
            text: folded.slice(range_start, range_end).to_string(),
            highlighted: true,
        });
        cursor = range_end;
    }
    push_plain(&mut segments, folded.slice(cursor, end));
    Snippet { segments }
}

fn push_plain(segments: &mut Vec<SnippetSegment>, text: &str) {
    if text.is_empty() {
        return;
    }
    let mut collapsed = String::with_capacity(text.len());
    let mut in_space = false;
    for c in text.chars() {
        if c.is_whitespace() {
            if !in_space {
                collapsed.push(' ');
            }
            in_space = true;
        } else {
            collapsed.push(c);
            in_space = false;
        }
    }
    segments.push(SnippetSegment {
        text: collapsed,
        highlighted: false,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(snippet: &Snippet) -> String {
        snippet
            .segments
            .iter()
            .map(|segment| {
                if segment.highlighted {
                    format!("[{}]", segment.text)
                } else {
                    segment.text.clone()
                }
            })
            .collect()
    }

    #[test]
    fn highlights_the_matching_section_with_its_original_spelling() {
        let terms = query_terms(&[], &["محمد"]);
        let matches = find_matches(
            &terms,
            "Weekly sync",
            &[
                (Some(SearchSectionKind::Memos), "nothing here"),
                (
                    Some(SearchSectionKind::Transcript),
                    "قال مُحَمَّد إن الميزانية جاهزة",
                ),
            ],
            150,
        );

        assert!(matches.title.is_none());
        let (kind, snippet) = matches.body.unwrap();
        assert_eq!(kind, Some(SearchSectionKind::Transcript));
        assert_eq!(render(&snippet), "قال [مُحَمَّد] إن الميزانية جاهزة");
    }

    #[test]
    fn prefers_the_section_matching_more_terms_then_the_earlier_section() {
        let terms = query_terms(&[], &["budget", "Q3"]);
        let bodies = [
            (Some(SearchSectionKind::Memos), "budget only"),
            (Some(SearchSectionKind::Summary), "The Q3 budget is final"),
            (Some(SearchSectionKind::Transcript), "budget for q3 again"),
        ];

        let (kind, snippet) = find_matches(&terms, "", &bodies, 150).body.unwrap();

        assert_eq!(kind, Some(SearchSectionKind::Summary));
        assert_eq!(render(&snippet), "The [Q3] [budget] is final");
    }

    #[test]
    fn scattered_letters_get_no_snippet() {
        let terms = query_terms(&[], &["plan"]);
        let matches = find_matches(
            &terms,
            "Lap notes",
            &[(Some(SearchSectionKind::Memos), "a pal ran lap")],
            150,
        );

        assert!(matches.title.is_none());
        assert!(matches.body.is_none());
    }

    #[test]
    fn long_text_is_windowed_around_the_first_match() {
        let filler = "word ".repeat(60);
        let text = format!("{filler}the roadmap review {filler}");
        let terms = query_terms(&["roadmap review"], &[]);

        let (_, snippet) = find_matches(
            &terms,
            "",
            &[(Some(SearchSectionKind::Transcript), &text)],
            80,
        )
        .body
        .unwrap();
        let rendered = render(&snippet);

        assert!(rendered.starts_with("…word"), "{rendered}");
        assert!(rendered.contains("the [roadmap review] word"), "{rendered}");
        assert!(rendered.ends_with("…"), "{rendered}");
        assert!(rendered.chars().count() < 100, "{rendered}");
    }
}
