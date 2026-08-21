import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const maxDuration = 60;

// 1. Zod Schema za validaciju LLM odgovora
const IssueSchema = z.object({
  type: z.enum(["security", "bug", "performance", "style"]).catch("style"),
  description: z.string().min(1),
  suggestion: z.string().min(1),
});

const ArchNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z
    .enum(["function", "class", "api", "state", "component", "module", "file"])
    .catch("module"),
});

const ArchEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional().default("uses"),
});

const AnalysisResultSchema = z.object({
  summary: z.string().min(1),
  architecture: z.object({
    nodes: z.array(ArchNodeSchema).default([]),
    edges: z.array(ArchEdgeSchema).default([]),
  }),
  issues: z.array(IssueSchema).default([]),
});

export type AnalysisResultType = z.infer<typeof AnalysisResultSchema>;

// 2. Pomocna funkcija za kreiranje prompta
function buildPrompt(code: string): string {
  return `
You are a Senior Software Architect and Static Code Analysis Engine.
Analyze the provided code and extract its architecture as a directed graph and perform a code review.

CRITICAL REQUIREMENTS:
1. Return ONLY a valid, raw JSON object.
2. Do NOT wrap output in markdown code blocks (\`\`\`json or \`\`\`).
3. Output MUST be entirely in English.
4. Keep the summary concise (1 to 2 clear sentences).
5. Extract meaningful architectural components:
   - "nodes": id (string starting from 1), label (name of component/function/endpoint/class), type ('function' | 'class' | 'api' | 'state' | 'component' | 'module' | 'file')
   - "edges": source (source node id), target (target node id), label ('calls' | 'uses' | 'fetches' | 'renders' | 'imports')
6. "issues": Identify up to 3 high-impact issues. Categorize each strictly into 'security', 'bug', 'performance', or 'style'. Provide actionable suggestions.

JSON SCHEMA TO FOLLOW EXACTLY:
{
  "summary": "Brief architectural and quality summary.",
  "architecture": {
    "nodes": [
      { "id": "1", "label": "ComponentName", "type": "component" }
    ],
    "edges": [
      { "source": "1", "target": "2", "label": "calls" }
    ]
  },
  "issues": [
    {
      "type": "security",
      "description": "Clear explanation of the problem.",
      "suggestion": "How to resolve it."
    }
  ]
}

Code to analyze:
${code}
`;
}

// 3. Poziv prema Ollama instanci
// 3. Poziv prema Ollama instanci
async function queryOllama(prompt: string, ollamaUrl: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // Povećan timeout na 60s

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "qwen2.5-coder:7b",
        prompt: prompt,
        stream: false,
        format: "json",
        options: {
          temperature: 0.1,
          top_p: 0.9,
          num_predict: 2048, // FORSIRAMO DA MU NE PONESTANE MJESTA ZA PISANJE
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// POST Handler
export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { success: false, error: "Code is required and must not be empty." },
        { status: 400 },
      );
    }

    if (code.length > 15000) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Code snippet is too long. Please submit under 15,000 characters.",
        },
        { status: 400 },
      );
    }

    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    const prompt = buildPrompt(code);

    let rawResponse: string | null = null;
    let parsedData: unknown = null;

    // Pokušaj 1
    try {
      const data = await queryOllama(prompt, ollamaUrl);
      rawResponse = data.response;
      parsedData = JSON.parse(rawResponse as string);
    } catch (firstAttemptError) {
      console.warn(
        "Prvi pokušaj parsiranja pao. Model je halucinirao. Pokrećem retry...",
        firstAttemptError,
      );

      // Pokušaj 2 (Retry)
      try {
        const retryPrompt = `${prompt}\n\nCRITICAL: Your previous response was cut off or not a valid JSON. You MUST return ONLY a fully closed, valid JSON object without markdown.`;
        const retryData = await queryOllama(retryPrompt, ollamaUrl);
        rawResponse = retryData.response;
        parsedData = JSON.parse(rawResponse as string);
      } catch (secondAttemptError) {
        console.error("Oba pokušaja parsiranja su pala:", secondAttemptError);
        return NextResponse.json(
          {
            success: false,
            error:
              "AI model failed to generate a valid analysis. Try analyzing a slightly smaller chunk of code.",
          },
          { status: 422 },
        );
      }
    }

    // Validacija kroz Zod
    const validatedAnalysis = AnalysisResultSchema.safeParse(parsedData);

    if (!validatedAnalysis.success) {
      console.error("Zod Validation Failed:", validatedAnalysis.error.format());
      return NextResponse.json(
        {
          success: false,
          error: "AI returned an unknown structure. Please try again.",
        },
        { status: 422 },
      );
    }

    const analysisData = validatedAnalysis.data;

    const savedReview = await prisma.review.create({
      data: {
        code: code,
        summary: analysisData.summary,
        architecture: analysisData.architecture,
        issues: analysisData.issues,
      },
    });

    return NextResponse.json({
      success: true,
      id: savedReview.id,
      analysis: analysisData,
    });
  } catch (error: unknown) {
    console.error("Review API Error:", error);
    let errorMessage = "An unexpected server error occurred.";

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage =
          "Analysis timed out. The model took too long to respond.";
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}

// GET Handler za povijest
export async function GET() {
  try {
    const history = await prisma.review.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        summary: true,
        createdAt: true,
        code: true,
        architecture: true,
        issues: true,
      },
      take: 15,
    });

    return NextResponse.json({ success: true, history });
  } catch (error: unknown) {
    let errorMessage = "Failed to fetch history.";
    if (error instanceof Error) errorMessage = error.message;
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}
