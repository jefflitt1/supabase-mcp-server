# Supabase MCP Server

A custom MCP (Model Context Protocol) server for Supabase database operations, built for use with Docker MCP Toolkit.

## Features

- **Database Operations**: List tables, describe schemas, query data, insert/update/delete rows
- **SQL Execution**: Run arbitrary SQL queries
- **Storage**: List buckets and files

## Tools

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables in a schema |
| `describe_table` | Get table columns and types |
| `query_table` | Query data with filters, ordering, limits |
| `insert_row` | Insert a new row |
| `update_rows` | Update rows matching filters |
| `delete_rows` | Delete rows matching filters |
| `execute_sql` | Run raw SQL queries |
| `list_buckets` | List storage buckets |
| `list_files` | List files in a bucket |

## Installation

### Docker Hub

```bash
docker pull jglitt/supabase-mcp-server:latest
```

### Build Locally

```bash
npm install
npm run build
docker build -t supabase-mcp-server .
```

## Configuration

### Environment Variables

- `SUPABASE_URL` - Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- `SUPABASE_SERVICE_KEY` - Supabase service role key

### Docker MCP Setup

1. Add to custom catalog or use existing:
```bash
docker mcp server enable supabase
```

2. Configure credentials:
```bash
docker mcp config write 'supabase:
  url: https://your-project.supabase.co
  service_key: your-service-key'
```

### Required Supabase Function

Create this function in your Supabase SQL Editor for full functionality:

```sql
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
```

## Usage

```bash
# List tables
docker mcp tools call list_tables 'schema=public'

# Query data
docker mcp tools call query_table 'table=profiles' 'limit=10'

# Execute SQL
docker mcp tools call execute_sql 'query=SELECT COUNT(*) FROM profiles'
```

## License

MIT
