import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

// POST: Pokreće analizu i sprema je u bazu
export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: "Code is required for analysis." },
        { status: 400 },
      );
    }

    const prompt = `
You are an expert Code Reviewer and Software Architect. Analyze the following code and return ONLY a valid JSON object (without any additional text or markdown tags like \`\`\`json).
IMPORTANT: Write all your analysis in English. Keep descriptions concise.

We need to visualize the architecture of this code as a graph. 
Extract the main components (functions, classes, modules, external API calls) as "nodes".
Extract the relationships (e.g., Function A calls Function B) as "edges".

Limit the "issues" array to a MAXIMUM of 3 most important issues. Keep the summary short (1-2 sentences).

Return EXACTLY this JSON structure:
{
  "summary": "A short summary of the code quality and architecture",
  "architecture": {
    "nodes": [
      { "id": "1", "label": "Name of function/class/module", "type": "function | class | api | state" }
    ],
    "edges": [
      { "source": "1", "target": "2", "label": "calls | uses | fetches" }
    ]
  },
  "issues": [
    {
      "type": "bug | security | style",
      "description": "Description of the issue",
      "suggestion": "Suggestion on how to fix it"
    }
  ]
}

Here is the code to analyze:
${code}
    `;

    // Tražimo varijablu, ako je nema (npr. kad radiš lokalno), koristimo localhost
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

    const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5-coder:7b",
        prompt: prompt,
        stream: false,
        format: "json",
        options: {
          temperature: 0.0,
        },
      }),
    });

    if (!ollamaResponse.ok) {
      throw new Error("Failed to communicate with local LLM.");
    }

    const data = await ollamaResponse.json();
    const parsedAnalysis = JSON.parse(data.response);

    // Spremanje u bazu
    const savedReview = await prisma.review.create({
      data: {
        code: code,
        summary: parsedAnalysis.summary,
        architecture: parsedAnalysis.architecture,
        issues: parsedAnalysis.issues,
      },
    });

    return NextResponse.json({
      success: true,
      id: savedReview.id,
      analysis: parsedAnalysis,
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    let errorMessage = "An unexpected server error occurred.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}

// GET: Dohvaća listu svih prethodnih analiza
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
      take: 10, // Dohvaća zadnjih 10 pregleda
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
