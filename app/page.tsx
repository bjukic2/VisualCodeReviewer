"use client";

import { useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Edge,
  Node,
  Position,
} from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";

// 1. Updated TypeScript interfaces
interface Issue {
  type: string;
  description: string;
  suggestion: string;
}

interface ArchNode {
  id: string;
  label: string;
  type: string;
}

interface ArchEdge {
  source: string;
  target: string;
  label?: string;
}

interface AnalysisResult {
  summary: string;
  architecture: {
    nodes: ArchNode[];
    edges: ArchEdge[];
  };
  issues: Issue[];
}

// 2. Inicijalizacija Dagre grafa
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 200;
const nodeHeight = 60;

const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction = "TB",
) => {
  const isHorizontal = direction === "LR";
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    // Postavljanje izračunate pozicije
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes, edges };
};

export default function Home() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");

  // State for React Flow
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const handleReview = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setNodes([]);
    setEdges([]);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Unsuccessful analysis.");

      const analysis: AnalysisResult = data.analysis;
      setResult(analysis);

      if (analysis.architecture) {
        const flowNodes: Node[] = analysis.architecture.nodes.map((n) => ({
          id: String(n.id),
          position: { x: 0, y: 0 }, // Dagre će prepisati ove nule
          data: { label: `${n.label} (${n.type})` },
          style: {
            background: "#1e1e2f",
            color: "#fff",
            border: "1px solid #4f46e5",
            borderRadius: "8px",
            padding: "10px",
            width: 180,
            textAlign: "center",
          },
        }));

        const flowEdges: Edge[] = analysis.architecture.edges.map(
          (e, index) => ({
            id: `e${e.source}-${e.target}-${index}`,
            source: String(e.source),
            target: String(e.target),
            label: e.label,
            animated: true,
            style: { stroke: "#4f46e5", strokeWidth: 2 },
          }),
        );

        // 3. Primjena Dagre algoritma prije postavljanja u state
        const { nodes: layoutedNodes, edges: layoutedEdges } =
          getLayoutedElements(flowNodes, flowEdges);

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unknown error!");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Visual Code Reviewer
        </h1>
        <p className="text-gray-400">
          Paste your code below and visualize the architecture using Qwen 2.5
          and React Flow.
        </p>

        <div className="space-y-2">
          <textarea
            rows={10}
            className="w-full p-4 bg-gray-900 border border-gray-800 rounded-lg font-mono text-sm focus:outline-none focus:border-indigo-500"
            placeholder="Paste your code here..."
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            onClick={handleReview}
            disabled={loading || !code.trim()}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-800 rounded-lg font-medium transition cursor-pointer"
          >
            {loading ? "Analyzing architecture..." : "Start visual analysis"}
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-950/50 border border-red-800 text-red-200 rounded-lg">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
              <h2 className="text-lg font-semibold text-indigo-400 mb-2">
                Architecture Summary
              </h2>
              <p className="text-gray-300">{result.summary}</p>
            </div>

            <div className="h-125 w-full border border-gray-800 rounded-lg overflow-hidden bg-gray-950">
              <ReactFlow nodes={nodes} edges={edges} fitView>
                <Background color="#333" gap={16} />
                <Controls />
                <MiniMap nodeColor="#4f46e5" maskColor="rgba(0,0,0,0.7)" />
              </ReactFlow>
            </div>

            <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
              <h2 className="text-lg font-semibold text-indigo-400 mb-4">
                Errors and suggestions
              </h2>
              <div className="space-y-3">
                {result.issues?.map((issue, i) => (
                  <div
                    key={i}
                    className="p-4 bg-gray-950 border border-gray-800 rounded"
                  >
                    <span className="text-xs uppercase px-2 py-1 rounded bg-amber-950 text-amber-400 font-bold mr-2">
                      {issue.type}
                    </span>
                    <p className="text-sm text-gray-200 mt-2">
                      <strong>Error:</strong> {issue.description}
                    </p>
                    <p className="text-sm text-emerald-400 mt-1">
                      <strong>Suggestion:</strong> {issue.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
