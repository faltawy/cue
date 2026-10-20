use tantivy::schema::{
    DateOptions, DateTimePrecision, FAST, Facet, FacetOptions, Field, STORED, STRING, Schema,
    TextFieldIndexing, TextOptions, Value,
};
use tantivy::{DateTime, TantivyDocument};

use crate::{SearchDocument, SearchSectionKind};

pub struct SchemaFields {
    pub id: Field,
    pub doc_type: Field,
    pub language: Field,
    pub title: Field,
    pub content: Field,
    pub created_at: Field,
    pub facets: Field,
    pub sections: [(SearchSectionKind, Field); SearchSectionKind::ALL.len()],
}

impl SchemaFields {
    pub fn text_fields(&self) -> Vec<Field> {
        let mut fields = vec![self.title, self.content];
        fields.extend(self.sections.iter().map(|(_, field)| *field));
        fields
    }

    pub fn section(&self, kind: SearchSectionKind) -> Field {
        self.sections
            .iter()
            .find(|(section_kind, _)| *section_kind == kind)
            .map(|(_, field)| *field)
            .expect("every section kind has a schema field")
    }
}

pub fn build_schema() -> Schema {
    let mut schema_builder = Schema::builder();
    schema_builder.add_text_field("id", STRING | STORED);
    schema_builder.add_text_field("doc_type", STRING | STORED);
    schema_builder.add_text_field("language", STRING | STORED);

    let text_indexing = TextFieldIndexing::default()
        .set_tokenizer("multilang")
        .set_index_option(tantivy::schema::IndexRecordOption::WithFreqsAndPositions);
    let text_options = TextOptions::default()
        .set_indexing_options(text_indexing)
        .set_stored();

    schema_builder.add_text_field("title", text_options.clone());
    schema_builder.add_text_field("content", text_options.clone());
    for kind in SearchSectionKind::ALL {
        schema_builder.add_text_field(kind.field_name(), text_options.clone());
    }
    schema_builder.add_date_field(
        "created_at",
        DateOptions::from(FAST | STORED).set_precision(DateTimePrecision::Milliseconds),
    );
    schema_builder.add_facet_field("facets", FacetOptions::default());
    schema_builder.build()
}

pub fn get_fields(schema: &Schema) -> SchemaFields {
    SchemaFields {
        id: schema.get_field("id").unwrap(),
        doc_type: schema.get_field("doc_type").unwrap(),
        language: schema.get_field("language").unwrap(),
        title: schema.get_field("title").unwrap(),
        content: schema.get_field("content").unwrap(),
        created_at: schema.get_field("created_at").unwrap(),
        facets: schema.get_field("facets").unwrap(),
        sections: SearchSectionKind::ALL
            .map(|kind| (kind, schema.get_field(kind.field_name()).unwrap())),
    }
}

pub fn build_tantivy_document(fields: &SchemaFields, document: &SearchDocument) -> TantivyDocument {
    let mut doc = TantivyDocument::new();
    doc.add_text(fields.id, &document.id);
    doc.add_text(fields.doc_type, &document.doc_type);
    doc.add_text(fields.language, document.language.as_deref().unwrap_or(""));
    doc.add_text(fields.title, &document.title);
    doc.add_text(fields.content, &document.content);
    for section in &document.sections {
        doc.add_text(fields.section(section.kind), &section.text);
    }
    doc.add_date(
        fields.created_at,
        DateTime::from_timestamp_millis(document.created_at),
    );
    for facet_path in &document.facets {
        if let Ok(facet) = Facet::from_text(facet_path) {
            doc.add_facet(fields.facets, facet);
        }
    }
    doc
}

pub fn extract_search_document(
    _schema: &Schema,
    fields: &SchemaFields,
    doc: &TantivyDocument,
) -> Option<SearchDocument> {
    let id = doc.get_first(fields.id)?.as_str()?.to_string();
    let doc_type = doc.get_first(fields.doc_type)?.as_str()?.to_string();
    let language = doc
        .get_first(fields.language)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let title = doc.get_first(fields.title)?.as_str()?.to_string();
    let content = doc.get_first(fields.content)?.as_str()?.to_string();
    let created_at = doc
        .get_first(fields.created_at)?
        .as_datetime()?
        .into_timestamp_millis();

    let facets: Vec<String> = doc
        .get_all(fields.facets)
        .filter_map(|v| v.as_facet().map(|f| f.to_string()))
        .collect();

    Some(SearchDocument {
        id,
        doc_type,
        language,
        title,
        content,
        created_at,
        facets,
        sections: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_schema_stores_created_at_as_date_field() {
        let schema = build_schema();
        let created_at = schema.get_field("created_at").unwrap();
        let entry = schema.get_field_entry(created_at);

        assert!(entry.field_type().is_date());
        assert!(entry.is_fast());
        assert!(entry.is_stored());
    }

    #[test]
    fn test_extract_search_document_reads_created_at_date_field_as_epoch_millis() {
        let schema = build_schema();
        let fields = get_fields(&schema);
        let mut doc = TantivyDocument::new();

        doc.add_text(fields.id, "doc-1");
        doc.add_text(fields.doc_type, "session");
        doc.add_text(fields.language, "en");
        doc.add_text(fields.title, "Title");
        doc.add_text(fields.content, "Content");
        doc.add_date(
            fields.created_at,
            DateTime::from_timestamp_millis(1_710_000_000_123),
        );

        let extracted = extract_search_document(&schema, &fields, &doc).unwrap();
        assert_eq!(extracted.created_at, 1_710_000_000_123);
    }
}
