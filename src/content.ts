/// <reference types="chrome"/>

// Cache de traduções para evitar requests repetidos
const translationCache: Map<string, string> = new Map();

// Configurações padrão do content script - fixo para EN → PT
let contentSourceLanguage = 'en';
let contentTargetLanguage = 'pt';
let contentIsEnabled = true;

// API Key fixa do Groq (temporária para testes)
const GROQ_API_KEY_FIXED = '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';

// Timeout para debounce
let translateTimeout: NodeJS.Timeout;

// Carrega configurações do storage
chrome.storage.sync.get(['isEnabled'], (result) => {
	// Se não tem configuração salva, mantém ativo por padrão
	contentIsEnabled = result.isEnabled !== false;
	console.log('Content script - Configurações carregadas - Ativo:', contentIsEnabled);

	// Se está ativo, processa mensagens imediatamente
	if (contentIsEnabled) {
		setTimeout(processMessages, 2000);
	}
});

// API de tradução usando Groq AI
async function translateText(text: string, from: string = 'en', to: string = 'pt'): Promise<string> {
	// Verifica cache primeiro
	const cacheKey = `${text}_${from}_${to}`;
	if (translationCache.has(cacheKey)) {
		console.log('Usando tradução do cache:', text.substring(0, 30));
		return translationCache.get(cacheKey)!;
	}

	try {
		console.log('Traduzindo via Groq API:', text.substring(0, 50));

		const prompt = `Você é um tradutor especializado. Traduza o seguinte texto do inglês para português brasileiro de forma natural e fluente.

REGRAS:
- Mantenha o tom e contexto original
- Use português brasileiro padrão
- Se já estiver em português, mantenha como está
- Retorne APENAS a tradução, sem explicações
- Para gírias ou expressões, use equivalentes naturais em português

TEXTO PARA TRADUZIR:
${text}

TRADUÇÃO:`;

		const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${GROQ_API_KEY_FIXED}`,
			},
			body: JSON.stringify({
				model: 'llama3-8b-8192',
				messages: [
					{
						role: 'user',
						content: prompt,
					},
				],
				temperature: 0.3,
				max_tokens: 300,
				top_p: 1,
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(`Erro na API Groq: ${response.status} - ${response.statusText}`);
		}

		const data = await response.json();
		const translation = data.choices[0]?.message?.content?.trim();

		if (!translation) {
			throw new Error('Resposta vazia do Groq');
		}

		console.log('Tradução recebida do Groq:', translation);

		// Salva no cache
		translationCache.set(cacheKey, translation);

		// Atualiza estatísticas no storage
		updateTranslationStats();

		return translation;
	} catch (error) {
		console.error('Erro na tradução via Groq:', error);

		// Em caso de erro, tenta usar uma tradução simples como fallback
		// Ou retorna o texto original
		return text;
	}
}

// Atualiza estatísticas de tradução
function updateTranslationStats() {
	chrome.storage.local.get(['translatedCount', 'cacheSize'], (result) => {
		const newCount = (result.translatedCount || 0) + 1;
		const newCacheSize = translationCache.size;

		chrome.storage.local.set({
			translatedCount: newCount,
			cacheSize: newCacheSize,
		});
	});
}

// Cria elemento de tradução
function createTranslationElement(originalText: string, translatedText: string): HTMLElement {
	const translationDiv = document.createElement('div');
	translationDiv.className = 'telegram-translation';
	translationDiv.style.cssText = `
		background: rgba(0, 150, 136, 0.1);
		border-left: 3px solid #009688;
		padding: 8px 12px;
		margin: 4px 0;
		border-radius: 4px;
		font-size: 14px;
		color: #e0e0e0;
		font-family: -apple-system, system-ui, sans-serif;
	`;

	translationDiv.innerHTML = `
		<div class="translation-text" style="margin-bottom: 4px; line-height: 1.4;">${translatedText}</div>
		<div class="translation-badge" style="font-size: 11px; opacity: 0.7; display: flex; align-items: center; gap: 4px;">
			🤖 Traduzido com Groq AI
		</div>
	`;

	return translationDiv;
}

// Verifica se o elemento já foi traduzido
function isAlreadyTranslated(element: Element): boolean {
	return element.nextElementSibling?.classList.contains('telegram-translation') === true;
}

// Processa mensagens do Telegram
async function processMessages() {
	if (!contentIsEnabled) {
		console.log('Tradução desabilitada');
		return;
	}

	console.log('Processando mensagens...');

	// Seletores para diferentes tipos de mensagem no Telegram Web
	const messageSelectors = [
		'.message-content .text-content',
		'.message .text',
		'.message-text',
		'[data-message-id] .text-content',
		'.text-content',
		'.message .text-content',
		'.bubble .text-content',
	];

	let allMessages: Element[] = [];

	// Coleta todas as mensagens
	for (const selector of messageSelectors) {
		const messages = document.querySelectorAll(selector);
		console.log(`Seletor "${selector}" encontrou ${messages.length} mensagens`);
		allMessages.push(...Array.from(messages));
	}

	// Remove duplicatas e pega apenas as últimas 5 mensagens (reduzido para economizar API calls)
	const uniqueMessages = Array.from(new Set(allMessages));
	const lastMessages = uniqueMessages.slice(-5);

	console.log(`Total de mensagens únicas: ${uniqueMessages.length}, processando últimas: ${lastMessages.length}`);

	for (const message of lastMessages) {
		if (isAlreadyTranslated(message)) {
			console.log('Mensagem já traduzida:', message.textContent?.substring(0, 50));
			continue;
		}

		if (!message.textContent) {
			console.log('Mensagem sem texto');
			continue;
		}

		const text = message.textContent.trim();
		console.log('Processando texto:', text);

		// Ignora mensagens muito curtas (menos de 3 caracteres)
		if (text.length < 3) {
			console.log('Texto muito curto, ignorando');
			continue;
		}

		// Ignora mensagens que são apenas números, emojis ou símbolos
		if (/^[\d\s\p{Emoji}\p{Symbol}\p{Punctuation}]+$/u.test(text)) {
			console.log('Texto contém apenas números/símbolos/emojis, ignorando');
			continue;
		}

		// Como você removeu a detecção de idioma, sempre vai tentar traduzir
		const shouldTranslate = true;

		if (!shouldTranslate) {
			console.log('Não vai traduzir');
			continue;
		}

		try {
			console.log('Iniciando tradução:', text);
			const translation = await translateText(text, 'en', 'pt');
			console.log('Tradução concluída:', translation);

			// Só adiciona tradução se for diferente do original
			if (translation !== text && translation.toLowerCase() !== text.toLowerCase()) {
				console.log('Adicionando tradução à interface');
				const translationElement = createTranslationElement(text, translation);
				message.parentNode?.insertBefore(translationElement, message.nextSibling);
			} else {
				console.log('Tradução igual ao original, não adicionando');
			}
		} catch (error) {
			console.error('Erro ao processar mensagem:', error);
		}
	}
}

// Função específica para processar apenas mensagens novas
async function processNewMessages(newNodes: NodeList) {
	if (!contentIsEnabled) return;

	for (const node of Array.from(newNodes)) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			const element = node as Element;

			// Procura por mensagens dentro do novo elemento
			const messageSelectors = [
				'.message-content .text-content',
				'.message .text',
				'.message-text',
				'.text-content',
			];

			for (const selector of messageSelectors) {
				const messages = element.matches(selector) ? [element] : Array.from(element.querySelectorAll(selector));

				for (const message of messages) {
					if (!message.textContent || isAlreadyTranslated(message)) continue;

					const text = message.textContent.trim();
					if (text.length < 3) continue;

					// Ignora textos que são apenas símbolos/números/emojis
					if (/^[\d\s\p{Emoji}\p{Symbol}\p{Punctuation}]+$/u.test(text)) continue;

					try {
						const translation = await translateText(text, 'en', 'pt');
						if (translation !== text && translation.toLowerCase() !== text.toLowerCase()) {
							const translationElement = createTranslationElement(text, translation);
							message.parentNode?.insertBefore(translationElement, message.nextSibling);
						}
					} catch (error) {
						console.error('Erro ao processar mensagem nova:', error);
					}
				}
			}
		}
	}
}

// Observer para detectar novas mensagens
const observer = new MutationObserver((mutations) => {
	mutations.forEach((mutation) => {
		if (mutation.addedNodes.length > 0) {
			// Debounce para evitar muitas chamadas (aumentado para 500ms para dar tempo da API)
			clearTimeout(translateTimeout);
			translateTimeout = setTimeout(() => {
				processNewMessages(mutation.addedNodes);
			}, 500);
		}
	});
});

// Inicia quando a página carregar
function initialize() {
	console.log('Telegram Translator com Groq AI iniciado!');

	// Garante que a configuração padrão seja salva se não existir
	chrome.storage.sync.get(['isEnabled'], (result) => {
		if (result.isEnabled === undefined) {
			chrome.storage.sync.set({ isEnabled: true }, () => {
				console.log('Configuração padrão salva: ativo');
			});
		}
	});

	// Processa mensagens existentes
	if (contentIsEnabled) {
		processMessages();
	}

	// Observa novas mensagens
	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
}

// Aguarda o Telegram carregar completamente
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initialize);
} else {
	setTimeout(initialize, 1000); // Aguarda 1s se já carregou
}

// Escuta mudanças nas configurações
chrome.storage.onChanged.addListener((changes) => {
	if (changes.isEnabled) {
		contentIsEnabled = changes.isEnabled.newValue;
		console.log('Estado da tradução alterado para:', contentIsEnabled);
	}
});

// Escuta mensagens do popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log('Mensagem recebida no content script:', message);

	if (message.action === 'toggleTranslation') {
		contentIsEnabled = message.enabled;
		console.log('Tradução toggled via popup para:', contentIsEnabled);
		sendResponse({ success: true, enabled: contentIsEnabled });
	}
});
