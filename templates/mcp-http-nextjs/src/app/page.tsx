export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">MCP HTTP Server</h1>
        <p className="text-gray-400 mb-8">
          This Next.js app embeds an MCP server as an API route. 
          Connect any MCP client to <code className="bg-gray-800 px-2 py-1 rounded">/api/mcp</code>.
        </p>

        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="font-semibold mb-2">Available Tools</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-1">
              <li><code>echo</code> — Echoes back your message</li>
              <li><code>compute</code> — Math operations</li>
              <li><code>fetch_data</code> — HTTP requests</li>
            </ul>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="font-semibold mb-2">Test It</h2>
            <pre className="bg-gray-800 p-3 rounded text-sm overflow-x-auto text-gray-300">
{`curl -X POST http://localhost:3000/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
}
