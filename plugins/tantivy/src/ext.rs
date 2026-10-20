use tantivy::collector::{Count, TopDocs};
use tantivy::indexer::IndexWriterOptions;
use tantivy::query::{
    AllQuery, BooleanQuery, BoostQuery, FuzzyTermQuery, Occur, PhraseQuery, Query, QueryParser,
    TermQuery,
};
use tantivy::schema::{Facet, Field, IndexRecordOption, Value};
use tantivy::{Index, ReloadPolicy, TantivyDocument, Term};
use tauri_plugin_settings::SettingsPluginExt;

use crate::query::build_created_at_range_query;
use crate::schema::{SchemaFields, build_tantivy_document, extract_search_document, get_fields};
use crate::snippet::{find_matches, query_terms};
use crate::tokenizer::register_tokenizers;
use crate::{
    CollectionConfig, CollectionIndex, IndexState, SearchDocument, SearchHit, SearchRequest,
    SearchResult,
};

// Title matches outrank body matches (Orama's title:3, content:1).
const TITLE_BOOST: f32 = 3.0;

fn create_index_writer(index: &Index) -> tantivy::Result<tantivy::IndexWriter> {
    index.writer_with_options(
        IndexWriterOptions::builder()
            .num_worker_threads(1)
            .num_merge_threads(1)
            .build(),
    )
}

pub fn detect_language(text: &str) -> anlg_language::Language {
    anlg_language::detect(text)
}

fn parse_query_parts(query: &str) -> (Vec<&str>, Vec<&str>) {
    let mut phrases = Vec::new();
    let mut regular_terms = Vec::new();
    let mut in_quote = false;
    let mut quote_start = 0;
    let mut current_start = 0;

    let chars: Vec<char> = query.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '"' {
            if in_quote {
                let phrase = &query[quote_start..i];
                if !phrase.trim().is_empty() {
                    phrases.push(phrase.trim());
                }
                in_quote = false;
                current_start = i + 1;
            } else {
                let before = &query[current_start..i];
                for term in before.split_whitespace() {
                    if !term.is_empty() {
                        regular_terms.push(term);
                    }
                }
                in_quote = true;
                quote_start = i + 1;
            }
        }
        i += 1;
    }

    if in_quote {
        let phrase = &query[quote_start..];
        if !phrase.trim().is_empty() {
            phrases.push(phrase.trim());
        }
    } else {
        let remaining = &query[current_start..];
        for term in remaining.split_whitespace() {
            if !term.is_empty() {
                regular_terms.push(term);
            }
        }
    }

    (phrases, regular_terms)
}

// The term must match in the title or any body field.
fn any_text_field(
    fields: &SchemaFields,
    query_for: impl Fn(Field) -> Box<dyn Query>,
) -> Box<dyn Query> {
    let mut alternatives: Vec<(Occur, Box<dyn Query>)> = vec![(
        Occur::Should,
        Box::new(BoostQuery::new(query_for(fields.title), TITLE_BOOST)),
    )];
    for field in fields.text_fields().into_iter().skip(1) {
        alternatives.push((Occur::Should, query_for(field)));
    }
    Box::new(BooleanQuery::new(alternatives))
}

fn build_text_query(
    index: &Index,
    fields: &SchemaFields,
    request: &SearchRequest,
) -> Box<dyn Query> {
    if request.query.trim().is_empty() {
        return Box::new(AllQuery);
    }

    if !request.options.fuzzy.unwrap_or(false) {
        let mut parser = QueryParser::for_index(index, fields.text_fields());
        parser.set_conjunction_by_default();
        parser.set_field_boost(fields.title, TITLE_BOOST);
        let (query, _errors) = parser.parse_query_lenient(&request.query);
        return query;
    }

    let distance = request.options.distance.unwrap_or(1);
    let phrase_slop = request.options.phrase_slop.unwrap_or(0);
    let (phrases, regular_terms) = parse_query_parts(&request.query);
    let mut term_queries: Vec<(Occur, Box<dyn Query>)> = Vec::new();

    for phrase in phrases {
        let words: Vec<&str> = phrase.split_whitespace().collect();
        if words.len() > 1 {
            term_queries.push((
                Occur::Must,
                any_text_field(fields, |field| {
                    let terms = words
                        .iter()
                        .map(|word| Term::from_field_text(field, word))
                        .collect();
                    let mut phrase_query = PhraseQuery::new(terms);
                    phrase_query.set_slop(phrase_slop);
                    Box::new(phrase_query)
                }),
            ));
        } else if let Some(word) = words.first() {
            term_queries.push((
                Occur::Must,
                any_text_field(fields, |field| {
                    Box::new(FuzzyTermQuery::new(
                        Term::from_field_text(field, word),
                        distance,
                        true,
                    ))
                }),
            ));
        }
    }

    for term in regular_terms {
        term_queries.push((
            Occur::Must,
            any_text_field(fields, |field| {
                Box::new(FuzzyTermQuery::new(
                    Term::from_field_text(field, term),
                    distance,
                    true,
                ))
            }),
        ));
    }

    Box::new(BooleanQuery::new(term_queries))
}

pub(crate) fn search_collection(
    collection: &CollectionIndex,
    request: &SearchRequest,
) -> Result<SearchResult, crate::Error> {
    let schema = &collection.schema;
    let fields = get_fields(schema);
    let searcher = collection.reader.searcher();

    let mut combined_query = build_text_query(&collection.index, &fields, request);

    if let Some(ref created_at_filter) = request.filters.created_at
        && let Some(range_query) =
            build_created_at_range_query(fields.created_at, created_at_filter)
    {
        combined_query = Box::new(BooleanQuery::new(vec![
            (Occur::Must, combined_query),
            (Occur::Must, range_query),
        ]));
    }

    if let Some(ref doc_type) = request.filters.doc_type {
        let doc_type_term = Term::from_field_text(fields.doc_type, doc_type);
        let doc_type_query = TermQuery::new(doc_type_term, IndexRecordOption::Basic);
        combined_query = Box::new(BooleanQuery::new(vec![
            (Occur::Must, combined_query),
            (Occur::Must, Box::new(doc_type_query)),
        ]));
    }

    if let Some(ref facet_path) = request.filters.facet
        && let Ok(facet) = Facet::from_text(facet_path)
    {
        let facet_term = Term::from_facet(fields.facets, &facet);
        let facet_query = TermQuery::new(facet_term, IndexRecordOption::Basic);
        combined_query = Box::new(BooleanQuery::new(vec![
            (Occur::Must, combined_query),
            (Occur::Must, Box::new(facet_query)),
        ]));
    }

    let (top_docs, count) = searcher.search(
        &combined_query,
        &(TopDocs::with_limit(request.limit), Count),
    )?;

    let snippet_terms = if request.options.snippets.unwrap_or(false) {
        let (phrases, regular_terms) = parse_query_parts(&request.query);
        Some(query_terms(&phrases, &regular_terms))
    } else {
        None
    };
    let snippet_max_chars = request.options.snippet_max_chars.unwrap_or(150);

    let mut hits = Vec::new();
    for (score, doc_address) in top_docs {
        let retrieved_doc: TantivyDocument = searcher.doc(doc_address)?;
        let Some(search_doc) = extract_search_document(schema, &fields, &retrieved_doc) else {
            continue;
        };

        let matches = snippet_terms.as_ref().map(|terms| {
            let mut bodies: Vec<_> = fields
                .sections
                .iter()
                .flat_map(|(kind, field)| {
                    retrieved_doc
                        .get_all(*field)
                        .filter_map(|value| value.as_str())
                        .map(|text| (Some(*kind), text))
                })
                .collect();
            bodies.push((None, search_doc.content.as_str()));
            find_matches(terms, &search_doc.title, &bodies, snippet_max_chars)
        });
        let (title_snippet, body) = matches
            .map(|matches| (matches.title, matches.body))
            .unwrap_or_default();
        let (matched_section, content_snippet) = match body {
            Some((kind, snippet)) => (kind, Some(snippet)),
            None => (None, None),
        };

        hits.push(SearchHit {
            score,
            document: search_doc,
            title_snippet,
            content_snippet,
            matched_section,
        });
    }

    Ok(SearchResult { hits, count })
}

pub struct Tantivy<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Tantivy<'a, R, M> {
    pub async fn register_collection(&self, config: CollectionConfig) -> Result<(), crate::Error> {
        let vault_base = self.manager.app_handle().settings().vault_base()?;
        let index_path = vault_base.join(&config.path).into_std_path_buf();
        let version_path = index_path.join("schema_version");

        std::fs::create_dir_all(&index_path)?;

        let state = self.manager.state::<IndexState>();
        let mut guard = state.inner.write().await;

        if guard.collections.contains_key(&config.name) {
            tracing::debug!("Collection '{}' already registered", config.name);
            return Ok(());
        }

        let schema = (config.schema_builder)();

        let needs_reindex = if index_path.join("meta.json").exists() {
            let stored_version = std::fs::read_to_string(&version_path)
                .ok()
                .and_then(|s| s.trim().parse::<u32>().ok())
                .unwrap_or(0);
            stored_version != config.schema_version
        } else {
            false
        };

        let index = if index_path.join("meta.json").exists() && !needs_reindex {
            Index::open_in_dir(&index_path)?
        } else {
            if needs_reindex {
                tracing::debug!(
                    "Schema version changed for collection '{}', re-creating index",
                    config.name
                );
                std::fs::remove_dir_all(&index_path)?;
                std::fs::create_dir_all(&index_path)?;
            }
            Index::create_in_dir(&index_path, schema.clone())?
        };

        std::fs::write(&version_path, config.schema_version.to_string())?;

        register_tokenizers(&index);

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let writer = create_index_writer(&index)?;

        let collection_index = CollectionIndex {
            schema,
            index,
            reader,
            writer,
        };

        guard
            .collections
            .insert(config.name.clone(), collection_index);

        tracing::debug!(
            "Tantivy collection '{}' registered at {:?} (version: {})",
            config.name,
            index_path,
            config.schema_version
        );
        Ok(())
    }

    fn get_collection_name(collection: Option<String>) -> String {
        collection.unwrap_or_else(|| "default".to_string())
    }

    pub async fn search(&self, request: SearchRequest) -> Result<SearchResult, crate::Error> {
        let collection_name = Self::get_collection_name(request.collection.clone());
        let state = self.manager.state::<IndexState>();
        let guard = state.inner.read().await;

        let collection_index = guard
            .collections
            .get(&collection_name)
            .ok_or_else(|| crate::Error::CollectionNotFound(collection_name.clone()))?;

        search_collection(collection_index, &request)
    }

    pub async fn reindex(&self, collection: Option<String>) -> Result<(), crate::Error> {
        let collection_name = Self::get_collection_name(collection);
        let state = self.manager.state::<IndexState>();
        let mut guard = state.inner.write().await;

        let collection_index = guard
            .collections
            .get_mut(&collection_name)
            .ok_or_else(|| crate::Error::CollectionNotFound(collection_name.clone()))?;

        let schema = &collection_index.schema;
        let writer = &mut collection_index.writer;

        writer.delete_all_documents()?;

        let fields = get_fields(schema);

        writer.commit()?;

        tracing::debug!(
            "Reindex completed for collection '{}'. Index cleared and ready for new documents. Fields: {:?}",
            collection_name,
            fields.id
        );

        Ok(())
    }

    pub async fn add_document(
        &self,
        collection: Option<String>,
        document: SearchDocument,
    ) -> Result<(), crate::Error> {
        let collection_name = Self::get_collection_name(collection);
        let state = self.manager.state::<IndexState>();
        let mut guard = state.inner.write().await;

        let collection_index = guard
            .collections
            .get_mut(&collection_name)
            .ok_or_else(|| crate::Error::CollectionNotFound(collection_name.clone()))?;

        let schema = &collection_index.schema;
        let writer = &mut collection_index.writer;
        let fields = get_fields(schema);

        writer.add_document(build_tantivy_document(&fields, &document))?;
        writer.commit()?;

        tracing::debug!(
            "Added document '{}' to collection '{}'",
            document.id,
            collection_name
        );

        Ok(())
    }

    pub async fn update_document(
        &self,
        collection: Option<String>,
        document: SearchDocument,
    ) -> Result<(), crate::Error> {
        let collection_name = Self::get_collection_name(collection);
        let state = self.manager.state::<IndexState>();
        let mut guard = state.inner.write().await;

        let collection_index = guard
            .collections
            .get_mut(&collection_name)
            .ok_or_else(|| crate::Error::CollectionNotFound(collection_name.clone()))?;

        let schema = &collection_index.schema;
        let writer = &mut collection_index.writer;
        let fields = get_fields(schema);

        let id_term = Term::from_field_text(fields.id, &document.id);
        writer.delete_term(id_term);

        writer.add_document(build_tantivy_document(&fields, &document))?;
        writer.commit()?;

        tracing::debug!(
            "Updated document '{}' in collection '{}'",
            document.id,
            collection_name
        );

        Ok(())
    }

    pub async fn update_documents(
        &self,
        collection: Option<String>,
        documents: Vec<SearchDocument>,
    ) -> Result<(), crate::Error> {
        let collection_name = Self::get_collection_name(collection);
        let state = self.manager.state::<IndexState>();
        let mut guard = state.inner.write().await;

        let collection_index = guard
            .collections
            .get_mut(&collection_name)
            .ok_or_else(|| crate::Error::CollectionNotFound(collection_name.clone()))?;

        let schema = &collection_index.schema;
        let writer = &mut collection_index.writer;
        let fields = get_fields(schema);

        let count = documents.len();

        for document in documents {
            let id_term = Term::from_field_text(fields.id, &document.id);
            writer.delete_term(id_term);

            writer.add_document(build_tantivy_document(&fields, &document))?;
        }

        writer.commit()?;

        tracing::debug!(
            "Updated {} documents in collection '{}'",
            count,
            collection_name
        );

        Ok(())
    }

    pub async fn apply_document_batch(
        &self,
        collection: Option<String>,
        documents: Vec<SearchDocument>,
        removals: Vec<String>,
    ) -> Result<(), crate::Error> {
        let collection_name = Self::get_collection_name(collection);
        let state = self.manager.state::<IndexState>();
        let mut guard = state.inner.write().await;

        let collection_index = guard
            .collections
            .get_mut(&collection_name)
            .ok_or_else(|| crate::Error::CollectionNotFound(collection_name.clone()))?;

        let schema = &collection_index.schema;
        let writer = &mut collection_index.writer;
        let fields = get_fields(schema);
        let updated_count = documents.len();
        let removed_count = removals.len();

        for id in removals {
            writer.delete_term(Term::from_field_text(fields.id, &id));
        }

        for document in documents {
            writer.delete_term(Term::from_field_text(fields.id, &document.id));

            writer.add_document(build_tantivy_document(&fields, &document))?;
        }

        writer.commit()?;

        tracing::debug!(
            updated_count,
            removed_count,
            collection = collection_name,
            "applied search document batch"
        );

        Ok(())
    }

    pub async fn remove_document(
        &self,
        collection: Option<String>,
        id: String,
    ) -> Result<(), crate::Error> {
        let collection_name = Self::get_collection_name(collection);
        let state = self.manager.state::<IndexState>();
        let mut guard = state.inner.write().await;

        let collection_index = guard
            .collections
            .get_mut(&collection_name)
            .ok_or_else(|| crate::Error::CollectionNotFound(collection_name.clone()))?;

        let schema = &collection_index.schema;
        let writer = &mut collection_index.writer;
        let fields = get_fields(schema);

        let id_term = Term::from_field_text(fields.id, &id);
        writer.delete_term(id_term);
        writer.commit()?;

        tracing::debug!(
            "Removed document '{}' from collection '{}'",
            id,
            collection_name
        );

        Ok(())
    }
}

pub trait TantivyPluginExt<R: tauri::Runtime> {
    fn tantivy(&self) -> Tantivy<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> TantivyPluginExt<R> for T {
    fn tantivy(&self) -> Tantivy<'_, R, Self>
    where
        Self: Sized,
    {
        Tantivy {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tokenizer::get_tokenizer_name_for_language;
    use crate::{SearchFilters, SearchOptions, SearchSection, SearchSectionKind};
    use tantivy::schema::{STORED, Schema, TEXT};

    #[test]
    fn test_detect_language_tokenizer_integration() {
        let text = "The quick brown fox jumps over the lazy dog.";
        let lang = detect_language(text);
        let tokenizer_name = get_tokenizer_name_for_language(&lang);
        assert_eq!(tokenizer_name, "lang_en");
    }

    fn session(id: &str, title: &str, sections: &[(SearchSectionKind, &str)]) -> SearchDocument {
        SearchDocument {
            id: id.to_string(),
            doc_type: "session".to_string(),
            language: None,
            title: title.to_string(),
            content: String::new(),
            created_at: 0,
            facets: Vec::new(),
            sections: sections
                .iter()
                .map(|(kind, text)| SearchSection {
                    kind: *kind,
                    text: text.to_string(),
                })
                .collect(),
        }
    }

    fn collection(documents: &[SearchDocument]) -> CollectionIndex {
        let schema = crate::schema::build_schema();
        let index = Index::create_in_ram(schema.clone());
        register_tokenizers(&index);
        let mut writer = create_index_writer(&index).unwrap();
        let fields = get_fields(&schema);
        for document in documents {
            writer
                .add_document(build_tantivy_document(&fields, document))
                .unwrap();
        }
        writer.commit().unwrap();
        let reader = index.reader().unwrap();
        CollectionIndex {
            schema,
            index,
            reader,
            writer,
        }
    }

    fn search_notes(collection: &CollectionIndex, query: &str) -> Vec<SearchHit> {
        search_collection(
            collection,
            &SearchRequest {
                query: query.to_string(),
                collection: None,
                filters: SearchFilters::default(),
                limit: 10,
                options: SearchOptions {
                    snippets: Some(true),
                    ..Default::default()
                },
            },
        )
        .unwrap()
        .hits
    }

    #[test]
    fn finds_notes_by_section_text_and_names_the_section() {
        let notes = collection(&[
            session(
                "transcript",
                "Weekly sync",
                &[
                    (SearchSectionKind::Memos, "agenda items"),
                    (SearchSectionKind::Transcript, "قال مُحَمَّد إن الميزانية جاهزة"),
                ],
            ),
            session(
                "summary",
                "Planning",
                &[(SearchSectionKind::Summary, "Pricing review for Q3")],
            ),
            session("locked", "Locked board meeting", &[]),
        ]);

        let arabic = search_notes(&notes, "محمد");
        assert_eq!(arabic.len(), 1);
        assert_eq!(arabic[0].document.id, "transcript");
        assert_eq!(
            arabic[0].matched_section,
            Some(SearchSectionKind::Transcript)
        );
        assert!(arabic[0].document.sections.is_empty());

        let pricing = search_notes(&notes, "pricing q3");
        assert_eq!(pricing.len(), 1);
        assert_eq!(pricing[0].matched_section, Some(SearchSectionKind::Summary));
        let highlighted: Vec<_> = pricing[0]
            .content_snippet
            .as_ref()
            .unwrap()
            .segments
            .iter()
            .filter(|segment| segment.highlighted)
            .map(|segment| segment.text.as_str())
            .collect();
        assert_eq!(highlighted, ["Pricing", "Q3"]);

        let board = search_notes(&notes, "board");
        assert_eq!(board.len(), 1);
        assert_eq!(board[0].document.id, "locked");
        assert!(board[0].title_snippet.is_some());
        assert!(board[0].content_snippet.is_none());
    }

    #[test]
    fn title_matches_outrank_body_matches() {
        let notes = collection(&[
            session(
                "body",
                "Standup",
                &[(SearchSectionKind::Memos, "talked about the roadmap")],
            ),
            session("title", "Roadmap", &[]),
        ]);

        let hits = search_notes(&notes, "roadmap");

        assert_eq!(
            hits.iter()
                .map(|hit| hit.document.id.as_str())
                .collect::<Vec<_>>(),
            ["title", "body"]
        );
    }

    #[test]
    fn malformed_query_syntax_still_searches() {
        let notes = collection(&[session("note", "Budget (draft", &[])]);

        assert_eq!(search_notes(&notes, "budget (draft").len(), 1);
    }

    #[test]
    fn creates_a_minimum_budget_single_threaded_writer() {
        let mut schema = Schema::builder();
        schema.add_text_field("content", TEXT | STORED);
        let index = Index::create_in_ram(schema.build());

        create_index_writer(&index).unwrap();
    }
}
