Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

Use Library Id

If you already know exactly which library you want to use, add its Context7 ID to your prompt. That way, Context7 MCP server can skip the library-matching step and directly continue with retrieving docs.

Implement basic authentication with Supabase. use library /supabase/supabase for API and docs.

The slash syntax tells the MCP tool exactly which library to load docs for.
Specify a Version

To get documentation for a specific library version, just mention the version in your prompt:

How do I set up Next.js 14 middleware? use context7

Context7 will automatically match the appropriate version.
Available Tools

Context7 MCP provides the following tools that LLMs can use:

    resolve-library-id: Resolves a general library name into a Context7-compatible library ID.
        query (required): The user's question or task (used to rank results by relevance)
        libraryName (required): The name of the library to search for

    query-docs: Retrieves documentation for a library using a Context7-compatible library ID.
        libraryId (required): Exact Context7-compatible library ID (e.g., /mongodb/docs, /vercel/next.js)
        query (required): The question or task to get relevant documentation for
