export const indexMappings = {
  mappings: {
    properties: {
      display_date: {
        type: "date",
      },
      type: {
        type: "keyword",
      },
      subtype: {
        type: "keyword",
      },
      distributor: {
        properties: {
          reference_id: { type: "keyword" },
        },
      },
      taxonomy: {
        properties: {
          sections: {
            type: "nested",
            properties: {
              _id: { type: "keyword" },
              // get website as well
            },
          },
          tags: {
            properties: {
              text: {
                type: "text",
                fields: {
                  raw: { type: "keyword" },
                },
              },
              slug: { type: "keyword" },
            },
          },
        },
      },
    },
  },
};

// canonical website(who created content)
// store all ANS object except content_elements(for home page)
// look into multi website
// how to query to reteive object
