import { Buffer } from "node:buffer";

export default {
  async fetch (request) {
    if (request.method === "OPTIONS") {
      return handleOPTIONS();
    }
    const errHandler = (err) => {
      console.error(err);
      return new Response(err.message, fixCors({ status: err.status ?? 500 }));
    };
    try {
      const auth = request.headers.get("Authorization");
      const apiKey = auth?.split(" ")[1];
      const assert = (success) => {
        if (!success) {
          throw new HttpError("The specified HTTP method is not allowed for the requested resource", 400);
        }
      };
      const { pathname } = new URL(request.url);
      switch (true) {
        case pathname.endsWith("/chat/completions"):
          assert(request.method === "POST");
          return handleCompletions(await request.json(), apiKey)
            .catch(errHandler);
        case pathname.endsWith("/embeddings"):
          assert(request.method === "POST");
          return handleEmbeddings(await request.json(), apiKey)
            .catch(errHandler);
        case pathname.endsWith("/models"):
          assert(request.method === "GET");
          return handleModels(apiKey)
            .catch(errHandler);
        default:
          throw new HttpError("404 Not Found", 404);
      }
    } catch (err) {
      return errHandler(err);
    }
  }
};

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

const fixCors = ({ headers, status, statusText }) => {
  headers = new Headers(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return { headers, status, statusText };
};

const handleOPTIONS = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    }
  });
};

// ---------- OPENROUTER API ----------
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/free";

// ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------
const generateId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomChar = () => characters[Math.floor(Math.random() * characters.length)];
  return Array.from({ length: 29 }, randomChar).join("");
};

// ---------- ОБРАБОТЧИК CHAT COMPLETIONS ----------
async function handleCompletions (req, apiKey) {
  // Определяем модель
  let model = req.model || DEFAULT_MODEL;
  
  // Если модель начинается с "models/" (как в Gemini), убираем префикс
  if (model.startsWith("models/")) {
    model = model.substring(7);
  }
  
  // Если модель не содержит "/" и не является openrouter/free, используем default
  if (!model.includes("/") && model !== "openrouter/free") {
    model = DEFAULT_MODEL;
  }

  // Подготавливаем сообщения
  const messages = req.messages || [];
  
  // Формируем тело запроса для OpenRouter
  const requestBody = {
    model: model,
    messages: messages,
    temperature: req.temperature ?? 0.9,
    max_tokens: req.max_tokens ?? 1200,
    top_p: req.top_p ?? 1,
    frequency_penalty: req.frequency_penalty ?? 0,
    presence_penalty: req.presence_penalty ?? 0,
  };

  // Добавляем response_format если указан
  if (req.response_format) {
    requestBody.response_format = req.response_format;
  }

  // Отправляем запрос в OpenRouter
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://tr.4k7.ru',
      'X-Title': 'DM Master - D&D Character Generator'
    },
    body: JSON.stringify(requestBody)
  });

  // Получаем ответ
  let responseBody;
  
  if (response.ok) {
    const data = await response.json();
    const choice = data.choices?.[0];
    
    // Преобразуем ответ в формат, который ожидает клиент
    const result = {
      id: data.id || "chatcmpl-" + generateId(),
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: choice?.message?.content || ""
        },
        finish_reason: choice?.finish_reason || "stop"
      }],
      model: data.model || model,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      usage: data.usage || undefined
    };
    
    responseBody = JSON.stringify(result);
  } else {
    // В случае ошибки возвращаем ответ как есть
    responseBody = await response.text();
  }

  // Возвращаем ответ с CORS-заголовками
  return new Response(responseBody, fixCors({
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  }));
}

// ---------- ОБРАБОТЧИК EMBEDDINGS (заглушка для совместимости) ----------
async function handleEmbeddings (req, apiKey) {
  return new Response(JSON.stringify({
    object: "list",
    data: [],
    model: "embedding-stub"
  }), fixCors({ status: 200 }));
}

// ---------- ОБРАБОТЧИК MODELS (список доступных моделей) ----------
async function handleModels (apiKey) {
  const freeModels = [
    { id: "openrouter/free", object: "model", created: 0, owned_by: "openrouter" },
    { id: "google/gemini-2.5-flash:free", object: "model", created: 0, owned_by: "google" },
    { id: "google/gemini-2.0-flash:free", object: "model", created: 0, owned_by: "google" },
    { id: "meta-llama/llama-3.3-70b-instruct:free", object: "model", created: 0, owned_by: "meta" },
    { id: "openai/gpt-oss-20b:free", object: "model", created: 0, owned_by: "openai" },
    { id: "anthropic/claude-3.5-haiku:free", object: "model", created: 0, owned_by: "anthropic" },
    { id: "mistralai/mistral-7b-instruct:free", object: "model", created: 0, owned_by: "mistral" },
    { id: "qwen/qwen3.5-plus:free", object: "model", created: 0, owned_by: "qwen" },
    { id: "deepseek/deepseek-v4-flash:free", object: "model", created: 0, owned_by: "deepseek" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", object: "model", created: 0, owned_by: "nvidia" },
    { id: "xiaomi/mimo-v2-flash:free", object: "model", created: 0, owned_by: "xiaomi" },
    { id: "google/gemma-4-31b-it:free", object: "model", created: 0, owned_by: "google" }
  ];

  const body = JSON.stringify({
    object: "list",
    data: freeModels
  }, null, "  ");

  return new Response(body, fixCors({ status: 200 }));
}
