import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { code, history, message } = await request.json();

    if (!message)
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );

    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

    const systemMessage = {
      role: "system",
      content: `You are an expert AI software architect and senior developer. 
Answer questions clearly, concisely, and use markdown for code snippets.
CODE CONTEXT:\n${code}`,
    };

    const messages = [
      systemMessage,
      ...(history || []),
      { role: "user", content: message },
    ];

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5-coder:7b",
        messages: messages,
        stream: true,
        options: {
          temperature: 0.3,
          repeat_penalty: 1.15, // STROGA ZABRANA PONAVLJANJA ZNAKOVA
          top_p: 0.9,
          top_k: 40,
        },
      }),
    });

    if (!response.ok)
      throw new Error(`Ollama API returned status ${response.status}`);

    // Logika za čitanje Ollama streama i slanje frontendu
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) return controller.close();

        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n");
            buffer = parts.pop() || ""; // Zadrži zadnji nepotpuni dio u bufferu

            for (const part of parts) {
              if (!part.trim()) continue;
              const parsed = JSON.parse(part);
              if (parsed.message?.content) {
                // Šaljemo samo tekstualni sadržaj frontendu
                controller.enqueue(
                  new TextEncoder().encode(parsed.message.content),
                );
              }
            }
          }
        } catch (err) {
          console.error("Stream reading error:", err);
          controller.error(err);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: unknown) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 },
    );
  }
}
