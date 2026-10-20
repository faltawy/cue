use tantivy::tokenizer::Tokenizer;
use unicode_normalization::char::{decompose_canonical, is_combining_mark};

const TATWEEL: char = '\u{0640}';

// Folds what readers treat as the same letter: case, Latin accents, Arabic
// harakat, hamza seats, tatweel, and the alef maqsura / ta marbuta spellings.
// `emit` gets each folded char with the byte offset of the char it came from.
pub(crate) fn normalize_chars(text: &str, mut emit: impl FnMut(char, usize)) {
    for (offset, source) in text.char_indices() {
        if source == TATWEEL {
            continue;
        }
        decompose_canonical(source, |decomposed| {
            if is_combining_mark(decomposed) {
                return;
            }
            let folded = match decomposed {
                'ى' => 'ي',
                'ة' => 'ه',
                other => other,
            };
            for lower in folded.to_lowercase() {
                emit(lower, offset);
            }
        });
    }
}

#[derive(Clone)]
pub(crate) struct NormalizingTokenizer<T> {
    inner: T,
    buffer: String,
}

impl<T> NormalizingTokenizer<T> {
    pub(crate) fn new(inner: T) -> Self {
        Self {
            inner,
            buffer: String::new(),
        }
    }
}

impl<T: Tokenizer> Tokenizer for NormalizingTokenizer<T> {
    type TokenStream<'a> = T::TokenStream<'a>;

    fn token_stream<'a>(&'a mut self, text: &'a str) -> Self::TokenStream<'a> {
        self.buffer.clear();
        normalize_chars(text, |folded, _| self.buffer.push(folded));
        self.inner.token_stream(&self.buffer)
    }
}
