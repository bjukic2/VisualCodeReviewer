"use client";

import { useState, useEffect, useCallback } from "react";
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

interface Architecture {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

interface AnalysisResult {
  summary: string;
  architecture: Architecture;
  issues: Issue[];
}

interface HistoryItem {
  id: string;
  summary: string;
  createdAt: string;
  code: string;
  architecture: Architecture;
  issues: Issue[];
}

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
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/review");
      const data = await res.json();
      if (data.success) {
        setHistory(data.history);
      }
    } catch {
      console.error("Could not load history");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const res = await fetch("/api/review");
        const data = await res.json();
        if (data.success && isMounted) {
          setHistory(data.history);
        }
      } catch {
        console.error("Could not load history");
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const renderGraph = (arch: Architecture) => {
    if (!arch || !arch.nodes) return;

    const flowNodes: Node[] = arch.nodes.map((n) => ({
      id: String(n.id),
      position: { x: 0, y: 0 },
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

    const flowEdges: Edge[] = (arch.edges || []).map((e, index) => ({
      id: `e${e.source}-${e.target}-${index}`,
      source: String(e.source),
      target: String(e.target),
      label: e.label,
      animated: true,
      style: { stroke: "#4f46e5", strokeWidth: 2 },
    }));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      flowNodes,
      flowEdges,
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  };

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
      renderGraph(analysis.architecture);
      fetchHistory(); // Osvježi povijest nakon novog unosa
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

  // Učitavanje odabrane stavke iz povijesti
  const loadFromHistory = (item: HistoryItem) => {
    setCode(item.code);
    setResult({
      summary: item.summary,
      architecture: item.architecture,
      issues: item.issues,
    });
    renderGraph(item.architecture);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 flex flex-col md:flex-row gap-6">
      {/* Sidebar s poviješću */}
      <aside className="w-full md:w-72 bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col h-fit md:h-[calc(100vh-3rem)]">
        <h2 className="text-lg font-bold text-indigo-400 mb-3">
          Review History
        </h2>
        <div className="space-y-2 overflow-y-auto pr-1 flex-1">
          {history.length === 0 ? (
            <p className="text-xs text-gray-500">No saved reviews yet.</p>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => loadFromHistory(item)}
                className="w-full text-left p-2.5 rounded bg-gray-950/60 hover:bg-indigo-950/40 border border-gray-800 hover:border-indigo-700/50 transition cursor-pointer"
              >
                <p className="text-xs text-gray-400">
                  {new Date(item.createdAt).toLocaleDateString()}{" "}
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-xs text-gray-200 truncate mt-1">
                  {item.summary}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Glavni sadržaj */}
      <div className="flex-1 max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Visual Code Reviewer
          </h1>
          <p className="text-gray-400">
            Paste your code below and visualize the architecture using Qwen 2.5,
            React Flow, and PostgreSQL.
          </p>
        </div>

        <div className="space-y-2">
          <textarea
            rows={8}
            className="w-full p-4 bg-gray-900 border border-gray-800 rounded-lg font-mono text-sm focus:outline-none focus:border-indigo-500"
            placeholder="Paste your JavaScript/TypeScript/Python code here..."
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            onClick={handleReview}
            disabled={loading || !code.trim()}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-800 rounded-lg font-medium transition cursor-pointer"
          >
            {loading ? "Analyzing & saving..." : "Start visual analysis"}
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

            <div className="h-[480px] w-full border border-gray-800 rounded-lg overflow-hidden bg-gray-950">
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
