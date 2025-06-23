/// <reference types="chrome"/>

// Cache de traduções para evitar requests repetidos
const translationCache: Map<string, string> = new Map();

// Configurações padrão do content script - fixo para EN → PT
let contentSourceLanguage = 'en';
let contentTargetLanguage = 'pt';
let contentIsEnabled = true;

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

// API de tradução gratuita
async function translateText(text: string, from: string = 'auto', to: string = 'pt-br'): Promise<string> {
	// Verifica cache primeiro
	const cacheKey = `${text}_${from}_${to}`;
	if (translationCache.has(cacheKey)) {
		return translationCache.get(cacheKey)!;
	}

	try {
		const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
		const response = await fetch(url);
		const data = await response.json();

		if (data.responseStatus === 200) {
			const translation = data.responseData.translatedText;
			// Salva no cache
			translationCache.set(cacheKey, translation);
			return translation;
		}
	} catch (error) {
		console.error('Erro na tradução:', error);
	}

	return text; // Retorna texto original se falhar
}

// Cria elemento de tradução
function createTranslationElement(originalText: string, translatedText: string): HTMLElement {
	const translationDiv = document.createElement('div');
	translationDiv.className = 'telegram-translation';
	translationDiv.innerHTML = `
    <div class="translation-text">${translatedText}</div>
    <div class="translation-badge">🌐 Traduzido</div>
  `;
	return translationDiv;
}

// Verifica se o elemento já foi traduzido
function isAlreadyTranslated(element: Element): boolean {
	return element.nextElementSibling?.classList.contains('telegram-translation') === true;
}

// Detecta se o texto está em inglês
function isEnglishText(text: string): boolean {
	// Palavras comuns em inglês
	const englishWords = [
		'the',
		'and',
		'you',
		'that',
		'was',
		'for',
		'are',
		'with',
		'his',
		'they',
		'have',
		'this',
		'will',
		'can',
		'had',
		'her',
		'what',
		'said',
		'each',
		'which',
		'do',
		'how',
		'their',
		'if',
		'up',
		'out',
		'many',
		'then',
		'them',
		'these',
		'so',
		'some',
		'would',
		'make',
		'like',
		'into',
		'him',
		'has',
		'two',
		'more',
		'very',
		'know',
		'just',
		'first',
		'get',
		'over',
		'think',
		'also',
		'your',
		'work',
		'life',
		'only',
		'new',
		'years',
		'way',
		'may',
		'hello',
		'hi',
		'testing',
		'fine',
		'good',
		'great',
		'nice',
		'ok',
		'okay',
	];

	const words = text
		.toLowerCase()
		.replace(/[^\w\s]/g, '')
		.split(/\s+/);
	const englishCount = words.filter((word) => englishWords.includes(word)).length;

	// Se mais de 20% das palavras são inglesas, considera inglês
	const isEnglish = englishCount / words.length > 0.2;

	console.log(
		`Texto: "${text.substring(0, 50)}" | ${englishCount}/${
			words.length
		} palavras em inglês | É inglês: ${isEnglish}`
	);

	return isEnglish;
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

	// Remove duplicatas e pega apenas as últimas 10 mensagens
	const uniqueMessages = Array.from(new Set(allMessages));
	const lastMessages = uniqueMessages.slice(-10); // Últimas 10 mensagens

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

		// Ignora mensagens muito curtas
		if (text.length < 3) {
			console.log('Texto muito curto, ignorando');
			continue;
		}

		// Verifica se deve traduzir
		const shouldTranslate = isEnglishText(text);

		if (!shouldTranslate) {
			console.log('Não vai traduzir');
			continue;
		}

		try {
			console.log('Traduzindo:', text);
			const translation = await translateText(text, 'en', 'pt');
			console.log('Tradução recebida:', translation);

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
					if (text.length < 3 || !isEnglishText(text)) continue;

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
			// Debounce para evitar muitas chamadas
			clearTimeout(translateTimeout);
			translateTimeout = setTimeout(() => {
				processNewMessages(mutation.addedNodes);
			}, 300);
		}
	});
});

// Inicia quando a página carregar
function initialize() {
	console.log('Telegram Translator iniciado!');

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
	if (changes.isEnabled) contentIsEnabled = changes.isEnabled.newValue;
});
