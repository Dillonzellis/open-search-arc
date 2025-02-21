export const Mappings = {
  mappings: {
    dynamic: "strict",
    properties: {
      _id: { type: "keyword" },
      display_date: {
        type: "date",
        format: "yyyy-MM-dd'T'HH:mm:ss",
      },
      canonical_website: { type: "keyword" },
      distributor: {
        properties: {
          reference_id: { type: "keyword" },
        },
      },
      type: { type: "keyword" },
      subtype: { type: "keyword" },
      taxonomy: {
        properties: {
          sections: {
            type: "nested",
            properties: {
              _id: { type: "keyword" },
            },
          },
          tags: {
            type: "nested",
            properties: {
              text: { type: "keyword" },
              slug: { type: "keyword" },
            },
          },
        },
      },
      websites: {
        type: "flattened",
      },
    },
  },
};
