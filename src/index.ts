#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required"
      );
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  return supabase;
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "list_tables",
    description:
      "List all tables in the Supabase database. Returns table names, schemas, and row counts.",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: "Schema to list tables from (default: public)",
          default: "public",
        },
      },
    },
  },
  {
    name: "describe_table",
    description:
      "Get the schema/structure of a specific table including columns, types, and constraints.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Name of the table to describe",
        },
        schema: {
          type: "string",
          description: "Schema the table belongs to (default: public)",
          default: "public",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "query_table",
    description:
      "Query data from a table with optional filters, ordering, and limits.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Name of the table to query",
        },
        columns: {
          type: "string",
          description: "Comma-separated list of columns to select (default: *)",
          default: "*",
        },
        filters: {
          type: "object",
          description:
            "Key-value pairs for WHERE clause filters (equality only)",
          additionalProperties: true,
        },
        order_by: {
          type: "string",
          description: "Column to order by",
        },
        ascending: {
          type: "boolean",
          description: "Sort ascending (default: true)",
          default: true,
        },
        limit: {
          type: "number",
          description: "Maximum number of rows to return (default: 100)",
          default: 100,
        },
        offset: {
          type: "number",
          description: "Number of rows to skip (default: 0)",
          default: 0,
        },
      },
      required: ["table"],
    },
  },
  {
    name: "insert_row",
    description: "Insert a new row into a table.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Name of the table to insert into",
        },
        data: {
          type: "object",
          description: "Object containing column-value pairs to insert",
          additionalProperties: true,
        },
      },
      required: ["table", "data"],
    },
  },
  {
    name: "update_rows",
    description: "Update rows in a table that match the specified filters.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Name of the table to update",
        },
        data: {
          type: "object",
          description: "Object containing column-value pairs to update",
          additionalProperties: true,
        },
        filters: {
          type: "object",
          description:
            "Key-value pairs for WHERE clause (required to prevent accidental full-table updates)",
          additionalProperties: true,
        },
      },
      required: ["table", "data", "filters"],
    },
  },
  {
    name: "delete_rows",
    description: "Delete rows from a table that match the specified filters.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Name of the table to delete from",
        },
        filters: {
          type: "object",
          description:
            "Key-value pairs for WHERE clause (required to prevent accidental full-table deletes)",
          additionalProperties: true,
        },
      },
      required: ["table", "filters"],
    },
  },
  {
    name: "execute_sql",
    description:
      "Execute a raw SQL query. Use with caution. Supports SELECT, INSERT, UPDATE, DELETE.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "SQL query to execute",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_buckets",
    description: "List all storage buckets in Supabase.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_files",
    description: "List files in a storage bucket.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: {
          type: "string",
          description: "Name of the storage bucket",
        },
        path: {
          type: "string",
          description: "Path within the bucket (default: root)",
          default: "",
        },
        limit: {
          type: "number",
          description: "Maximum number of files to return (default: 100)",
          default: 100,
        },
      },
      required: ["bucket"],
    },
  },
];

// Tool implementations
async function listTables(schema: string = "public"): Promise<string> {
  const client = getSupabaseClient();

  // Try using the pg_tables view through RPC if available
  const { data, error } = await client.rpc("exec_sql", {
    sql_query: `
      SELECT tablename as table_name, schemaname as table_schema
      FROM pg_tables
      WHERE schemaname = '${schema}'
      ORDER BY tablename
    `,
  });

  if (error) {
    // If exec_sql doesn't exist, provide instructions
    return JSON.stringify({
      error: "exec_sql function not found",
      instructions: "Please create the exec_sql function in your Supabase database by running the following SQL in the SQL Editor:",
      sql: `
CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || sql_query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;
      `.trim()
    }, null, 2);
  }

  return JSON.stringify(data, null, 2);
}

async function describeTable(
  table: string,
  schema: string = "public"
): Promise<string> {
  const client = getSupabaseClient();

  // Use raw SQL to get column information
  const { data, error } = await client.rpc("exec_sql", {
    sql_query: `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = '${schema}'
      AND table_name = '${table}'
      ORDER BY ordinal_position
    `,
  });

  if (error) {
    return JSON.stringify({
      error: "exec_sql function not found",
      instructions: "Please create the exec_sql function first. See list_tables for the SQL.",
    }, null, 2);
  }

  return JSON.stringify(data, null, 2);
}

async function queryTable(args: {
  table: string;
  columns?: string;
  filters?: Record<string, any>;
  order_by?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
}): Promise<string> {
  const client = getSupabaseClient();
  const {
    table,
    columns = "*",
    filters = {},
    order_by,
    ascending = true,
    limit = 100,
    offset = 0,
  } = args;

  let query = client.from(table).select(columns);

  // Apply filters
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  // Apply ordering
  if (order_by) {
    query = query.order(order_by, { ascending });
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  return JSON.stringify(
    {
      count: data?.length || 0,
      data,
    },
    null,
    2
  );
}

async function insertRow(
  table: string,
  data: Record<string, any>
): Promise<string> {
  const client = getSupabaseClient();

  const { data: result, error } = await client
    .from(table)
    .insert(data)
    .select();

  if (error) {
    throw new Error(`Insert failed: ${error.message}`);
  }

  return JSON.stringify(
    {
      success: true,
      inserted: result,
    },
    null,
    2
  );
}

async function updateRows(
  table: string,
  data: Record<string, any>,
  filters: Record<string, any>
): Promise<string> {
  const client = getSupabaseClient();

  let query = client.from(table).update(data);

  // Apply filters
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  const { data: result, error } = await query.select();

  if (error) {
    throw new Error(`Update failed: ${error.message}`);
  }

  return JSON.stringify(
    {
      success: true,
      updated: result,
    },
    null,
    2
  );
}

async function deleteRows(
  table: string,
  filters: Record<string, any>
): Promise<string> {
  const client = getSupabaseClient();

  let query = client.from(table).delete();

  // Apply filters
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  const { data: result, error } = await query.select();

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }

  return JSON.stringify(
    {
      success: true,
      deleted: result,
    },
    null,
    2
  );
}

async function executeSql(query: string): Promise<string> {
  const client = getSupabaseClient();

  if (!query || query.trim() === "") {
    return JSON.stringify({
      error: "Empty query",
      message: "The query parameter was empty or not provided",
    }, null, 2);
  }

  const { data, error } = await client.rpc("exec_sql", {
    sql_query: query,
  });

  if (error) {
    return JSON.stringify({
      error: "SQL execution failed",
      message: error.message,
    }, null, 2);
  }

  return JSON.stringify(data, null, 2);
}

async function listBuckets(): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client.storage.listBuckets();

  if (error) {
    throw new Error(`Failed to list buckets: ${error.message}`);
  }

  return JSON.stringify(data, null, 2);
}

async function listFiles(
  bucket: string,
  path: string = "",
  limit: number = 100
): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client.storage.from(bucket).list(path, {
    limit,
  });

  if (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }

  return JSON.stringify(data, null, 2);
}

// Create and run server
async function main() {
  const server = new Server(
    {
      name: "supabase-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case "list_tables":
          result = await listTables(args?.schema as string);
          break;

        case "describe_table":
          result = await describeTable(
            args?.table as string,
            args?.schema as string
          );
          break;

        case "query_table":
          result = await queryTable(args as any);
          break;

        case "insert_row":
          result = await insertRow(
            args?.table as string,
            args?.data as Record<string, any>
          );
          break;

        case "update_rows":
          result = await updateRows(
            args?.table as string,
            args?.data as Record<string, any>,
            args?.filters as Record<string, any>
          );
          break;

        case "delete_rows":
          result = await deleteRows(
            args?.table as string,
            args?.filters as Record<string, any>
          );
          break;

        case "execute_sql":
          result = await executeSql(args?.query as string);
          break;

        case "list_buckets":
          result = await listBuckets();
          break;

        case "list_files":
          result = await listFiles(
            args?.bucket as string,
            args?.path as string,
            args?.limit as number
          );
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Supabase MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
