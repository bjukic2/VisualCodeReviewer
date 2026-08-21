"use client";

import React, {
  HTMLAttributes,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
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
import Link from "next/link";

// Novi alati
import Editor, { OnMount } from "@monaco-editor/react";
import { toPng } from "html-to-image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

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
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// 1. Pravilna TypeScript definicija za ReactMarkdown Code komponente
interface CodeBlockProps extends HTMLAttributes<HTMLElement> {
  node?: unknown;
  inline?: boolean;
  ref?: React.Ref<HTMLElement>;
}

// 2. Izdvojena i tipizirana komponenta za ispis koda
const CodeBlock = (props: CodeBlockProps) => {
  const { children, className, node, ref, ...rest } = props;
  const [isCopied, setIsCopied] = useState(false);

  const match = /language-(\w+)/.exec(className || "");
  const codeString = String(children).replace(/\n$/, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); // Vraća na staro nakon 2 sekunde
  };

  return match ? (
    <div className="relative group my-3">
      <button
        onClick={handleCopy}
        className={`absolute top-2 right-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-300 z-10 flex items-center gap-1.5 shadow-md ${
          isCopied
            ? "bg-emerald-600 text-white opacity-100 transform scale-105"
            : "bg-gray-700 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-600"
        }`}
        title="Copy code"
      >
        {isCopied ? "✅ Copied!" : "📋 Copy"}
      </button>
      <SyntaxHighlighter
        {...rest}
        style={vscDarkPlus}
        language={match[1]}
        PreTag="div"
        className="rounded-lg text-[11px] !bg-[#0a0a0f] border border-gray-800 pt-8"
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  ) : (
    <code
      ref={ref}
      {...rest}
      className="bg-indigo-950/50 text-indigo-300 px-1.5 py-0.5 rounded text-xs border border-indigo-900/50"
    >
      {children}
    </code>
  );
};

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
  const DEFAULT_CODE = "// Paste your code here...\n";
  const [code, setCode] = useState(DEFAULT_CODE);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const quickActions = [
    "Explain this code simply.",
    "How do I fix the first security issue?",
    "Rewrite this code to be more optimized.",
  ];

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/review");
      const data = await res.json();
      if (data.success) setHistory(data.history);
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
        if (data.success && isMounted) setHistory(data.history);
      } catch {
        console.error("Could not load history");
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleEditorMount: OnMount = (editor) => {
    editor.onDidFocusEditorText(() => {
      if (editor.getValue() === DEFAULT_CODE) {
        editor.setValue("");
        setCode("");
      }
    });
  };

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
    setChatHistory([]);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unsuccessful analysis.");
      setResult(data.analysis);
      renderGraph(data.analysis.architecture);
      fetchHistory();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Unknown error!");
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setCode(item.code);
    setResult({
      summary: item.summary,
      architecture: item.architecture,
      issues: item.issues,
    });
    renderGraph(item.architecture);
    setChatHistory([]);
  };

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || chatInput;
    if (!textToSend.trim()) return;

    const newMessage: ChatMessage = { role: "user", content: textToSend };
    const currentHistory = [...chatHistory];

    setChatHistory([...currentHistory, newMessage]);
    setChatInput("");
    setIsChatLoading(true);

    // 1. Kreiraj novi AbortController
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal, // <-- 2. DODAN SIGNAL
        body: JSON.stringify({
          code,
          history: currentHistory,
          message: textToSend,
        }),
      });

      if (!res.body) throw new Error("No response body");
      setChatHistory((prev) => [...prev, { role: "assistant", content: "" }]);
      setIsChatLoading(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        setChatHistory((prev) => {
          if (prev.length === 0) return prev; // <-- 3. DODAN OSIGURAČ PROTIV CRASHA

          const newHistory = [...prev];
          const lastIndex = newHistory.length - 1;
          newHistory[lastIndex] = {
            ...newHistory[lastIndex],
            content: newHistory[lastIndex].content + chunk,
          };
          return newHistory;
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Stream aborted by user."); // Ignoriraj grešku ako smo mi prekinuli
      } else {
        console.error(err);
      }
      setIsChatLoading(false);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const downloadImage = () => {
    if (reactFlowWrapper.current === null) return;
    toPng(reactFlowWrapper.current, { backgroundColor: "#030712" })
      .then((dataUrl) => {
        const a = document.createElement("a");
        a.setAttribute("download", "architecture-graph.png");
        a.setAttribute("href", dataUrl);
        a.click();
      })
      .catch((err) => console.error("Failed to export image", err));
  };

  return (
    // FULL SCREEN LAYOUT (h-screen, overflow-hidden) - 3 Kolone
    <main className="h-screen bg-gray-950 text-gray-100 flex overflow-hidden">
      {/* 1. LIJEVI STUPAC: Navigacija i Povijest */}
      <aside className="w-72 bg-gray-900 border-r border-gray-800 p-4 flex flex-col shrink-0 z-10">
        <h1 className="text-xl font-bold tracking-tight mb-6 text-white">
          Visual Reviewer
        </h1>

        <Link
          href="/dashboard"
          className="w-full text-center mb-6 py-2 bg-gray-800 hover:bg-gray-700 text-indigo-400 rounded-lg font-medium transition flex items-center justify-center gap-2"
        >
          📊 Open Dashboard
        </Link>

        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
          Review History
        </h2>
        <div className="space-y-2 overflow-y-auto pr-1 flex-1 custom-scrollbar">
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

      {/* 2. SREDNJI STUPAC: Editor, Graf i Greške */}
      <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[#0a0a0f]">
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-bold text-white">Code Editor</h2>
              <p className="text-sm text-gray-400">
                Write or paste your code here for analysis.
              </p>
            </div>
            <button
              onClick={handleReview}
              disabled={loading}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-800 rounded-lg font-medium transition shadow-lg shadow-indigo-900/20"
            >
              {loading ? "Analyzing..." : "Start Analysis"}
            </button>
          </div>

          <div className="h-87.5 w-full border border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <Editor
              height="100%"
              defaultLanguage="typescript"
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val || "")}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                padding: { top: 16 },
              }}
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-950/50 border border-red-800 text-red-200 rounded-lg">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl shadow-sm">
              <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-2">
                Summary
              </h2>
              <p className="text-gray-300 leading-relaxed">{result.summary}</p>
            </div>

            <div className="relative border border-gray-800 rounded-xl overflow-hidden bg-gray-950 shadow-sm">
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={downloadImage}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-md text-xs font-medium border border-gray-700 transition shadow-lg"
                >
                  💾 Export PNG
                </button>
              </div>
              <div className="h-112.5 w-full" ref={reactFlowWrapper}>
                <ReactFlow nodes={nodes} edges={edges} fitView>
                  <Background color="#333" gap={16} />
                  <Controls />
                  <MiniMap nodeColor="#4f46e5" maskColor="rgba(0,0,0,0.7)" />
                </ReactFlow>
              </div>
            </div>

            <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl shadow-sm">
              <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-4">
                Detected Issues
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.issues?.map((issue, i) => (
                  <div
                    key={i}
                    className="p-4 bg-gray-950 border border-gray-800 rounded-lg flex flex-col justify-between"
                  >
                    <div>
                      <span
                        className={`text-[10px] uppercase px-2 py-1 rounded font-bold mb-2 inline-block ${issue.type === "security" ? "bg-red-950 text-red-400" : issue.type === "bug" ? "bg-amber-950 text-amber-400" : issue.type === "performance" ? "bg-blue-950 text-blue-400" : "bg-gray-800 text-gray-300"}`}
                      >
                        {issue.type}
                      </span>
                      <p className="text-sm text-gray-200 mt-1">
                        <strong>Error:</strong> {issue.description}
                      </p>
                    </div>
                    <p className="text-sm text-emerald-400 mt-3 pt-3 border-t border-gray-800">
                      <strong>Suggestion:</strong> {issue.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. DESNI STUPAC: AI Chat */}
      <aside className="w-100 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0 z-10">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/95 backdrop-blur">
          <h2 className="text-md font-semibold text-indigo-400">
            Qwen Assistant
          </h2>
          {chatHistory.length > 0 && (
            <button
              onClick={() => {
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
                setChatHistory([]);
                setIsChatLoading(false);
              }}
              className="text-xs text-gray-400 hover:text-red-400 transition"
            >
              🧹 Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {chatHistory.length === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 italic">
                Select code and ask Qwen anything...
              </p>
              <div className="flex flex-col gap-2">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(action)}
                    className="text-xs text-left bg-gray-800/50 hover:bg-gray-700 text-gray-300 p-2.5 rounded-lg border border-gray-700/50 transition"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`px-4 py-3 max-w-[90%] text-sm shadow-sm ${msg.role === "user" ? "bg-indigo-600 text-white rounded-2xl rounded-tr-sm" : "bg-gray-950 text-gray-200 border border-gray-800 rounded-2xl rounded-tl-sm"}`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: CodeBlock,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 bg-gray-950 border border-gray-800 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                <span
                  className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></span>
                <span
                  className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                ></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-800 bg-gray-900">
          <div className="flex gap-2 bg-gray-950 p-1.5 rounded-xl border border-gray-800 focus-within:border-indigo-500 transition">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Ask follow-up..."
              className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none px-3"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isChatLoading || !chatInput.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-800 rounded-lg text-sm font-medium transition"
            >
              Send
            </button>
          </div>
        </div>
      </aside>
    </main>
  );
}
