"use strict";
async function processBatch() {
    if (messageQueue.length === 0 || !GROQ_API_KEY)
        return;
    console.log(`🚀 Processando batch de ${messageQueue.length} mensagens com Groq...`);
    const batch = messageQueue.splice(0, BATCH_SIZE);
    const texts = batch.map((item) => item.text);
    try {
        const translations = await translateWithGroq(texts);
        batch.forEach((item, index) => {
            const translation = translations[index];
            if (item.resolve) {
                item.resolve(translation);
            }
            if (item.element &&
                translation &&
                translation !== item.text &&
                translation.toLowerCase() !== item.text.toLowerCase()) {
                if (!isAlreadyTranslated(item.element)) {
                    addTranslationToElement(item.element, item.text, translation);
                    markAsTranslated(item.element);
                }
            }
        });
        if (messageQueue.length > 0) {
            setTimeout(processBatch, GROQ_REQUEST_DELAY);
        }
    }
    catch (error) {
        console.error('❌ Erro no processamento em batch:', error);
        batch.forEach((item) => {
            if (item.resolve) {
                item.resolve(item.text);
            }
        });
        const elementsToRetry = batch.filter((item) => item.element && !item.resolve);
        messageQueue.unshift(...elementsToRetry);
    }
}
function addTranslationToElement(element, originalText, translation) {
    console.log('➕ Adicionando tradução Groq:', translation);
    const translationElement = createTranslationElement(originalText, translation);
    translationElement.style.opacity = '0';
    translationElement.style.transform = 'translateY(-10px)';
    element.parentNode?.insertBefore(translationElement, element.nextSibling);
    setTimeout(() => {
        translationElement.style.transition = 'all 0.3s ease';
        translationElement.style.opacity = '1';
        translationElement.style.transform = 'translateY(0)';
    }, 50);
}
const translationCache = new Map();
const PROCESSED_ATTRIBUTE = 'data-telegram-translated';
let contentSourceLanguage = 'en';
let contentTargetLanguage = 'pt';
let contentIsEnabled = true;
let translateTimeout;
let GROQ_API_KEY = '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';
let lastGroqRequest = 0;
const GROQ_REQUEST_DELAY = 3000;
const BATCH_SIZE = 3;
let messageQueue = [];
let batchTimeout;
function injectTranslationStyles() {
    if (document.getElementById('telegram-translator-styles'))
        return;
    const style = document.createElement('style');
    style.id = 'telegram-translator-styles';
    style.textContent = `
			.telegram-translation {
				margin: 4px 0;
				padding: 8px 12px;
				background: linear-gradient(135deg, #ff8c42 0%, #ff6b1a 100%);
				border-radius: 12px;
				font-size: 13px;
				line-height: 1.4;
				box-shadow: 0 2px 8px rgba(255, 140, 66, 0.3);
				border-left: 3px solid #ff5722;
				opacity: 0;
				transform: translateY(-10px);
				transition: all 0.3s ease;
			}
			
			.telegram-translation.show {
				opacity: 1;
				transform: translateY(0);
			}
			
			.translation-text {
				color: white;
				font-weight: 500;
				margin-bottom: 4px;
			}
			
			.translation-badge {
				color: rgba(255, 255, 255, 0.8);
				font-size: 11px;
				font-weight: 400;
				display: flex;
				align-items: center;
				gap: 4px;
			}
			
			.translation-badge::before {
				content: "🌐";
				font-size: 12px;
			}
		`;
    document.head.appendChild(style);
}
chrome.storage.sync.get(['isEnabled'], (result) => {
    contentIsEnabled = result.isEnabled !== false;
    console.log('Content script - Configurações carregadas - Ativo:', contentIsEnabled);
    console.log('Groq API Key: ✅ Configurada (fixa no código)');
    console.log('🎯 Modo: APENAS TEMPO REAL - sem histórico');
    injectTranslationStyles();
    console.log('✅ Sistema ativo - aguardando novas mensagens...');
});
async function translateWithGroq(texts) {
    if (!GROQ_API_KEY) {
        console.error('❌ API Key do Groq não configurada!');
        return texts;
    }
    const now = Date.now();
    const timeSinceLastRequest = now - lastGroqRequest;
    if (timeSinceLastRequest < GROQ_REQUEST_DELAY) {
        const waitTime = GROQ_REQUEST_DELAY - timeSinceLastRequest;
        console.log(`⏱️ Aguardando ${waitTime}ms para próxima chamada Groq...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    lastGroqRequest = Date.now();
    try {
        console.log('🤖 Traduzindo com Groq AI:', texts.length, 'mensagens');
        const prompt = `Você é um tradutor especializado em conversas de chat do Telegram. Traduza as seguintes mensagens do inglês para português brasileiro de forma natural e contextual.
	
	REGRAS:
	- Mantenha o tom informal das conversas
	- Traduza gírias e expressões para equivalentes em português
	- Mantenha emojis e símbolos como estão
	- Se uma mensagem já estiver em português, mantenha como está
	- Retorne APENAS as traduções, uma por linha, na mesma ordem
	
	MENSAGENS PARA TRADUZIR:
	${texts.map((text, index) => `${index + 1}. ${text}`).join('\n')}
	
	TRADUÇÕES:`;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${GROQ_API_KEY}`,
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
                max_tokens: 1000,
                top_p: 1,
                stream: false,
            }),
        });
        if (!response.ok) {
            if (response.status === 429) {
                console.log('⚠️ Rate limit Groq atingido, aguardando...');
                await new Promise((resolve) => setTimeout(resolve, 5000));
                return translateWithGroq(texts);
            }
            throw new Error(`Groq API Error: ${response.status}`);
        }
        const data = await response.json();
        const translatedText = data.choices[0]?.message?.content?.trim();
        if (!translatedText) {
            throw new Error('Resposta vazia do Groq');
        }
        console.log('🤖 Resposta bruta do Groq:', translatedText);
        const translations = translatedText
            .split('\n')
            .map((line) => line.replace(/^\d+\.\s*/, '').trim())
            .filter((line) => line.length > 0);
        console.log('✅ Traduções processadas:', translations);
        texts.forEach((originalText, index) => {
            if (translations[index]) {
                const cacheKey = `${originalText}_en_pt`;
                translationCache.set(cacheKey, translations[index]);
            }
        });
        while (translations.length < texts.length) {
            translations.push(texts[translations.length]);
        }
        return translations;
    }
    catch (error) {
        console.error('💥 Erro na tradução Groq:', error);
        return texts;
    }
}
async function translateText(text, from = 'en', to = 'pt') {
    const cacheKey = `${text}_${from}_${to}`;
    if (translationCache.has(cacheKey)) {
        console.log('📦 Usando cache para:', text);
        return translationCache.get(cacheKey);
    }
    return new Promise((resolve) => {
        const messageItem = { element: null, text: text, resolve };
        messageQueue.push(messageItem);
        if (!batchTimeout) {
            batchTimeout = setTimeout(async () => {
                await processBatch();
                batchTimeout = undefined;
            }, 1000);
        }
        setTimeout(() => resolve(text), 10000);
    });
}
function createTranslationElement(originalText, translatedText) {
    const translationDiv = document.createElement('div');
    translationDiv.className = 'telegram-translation';
    translationDiv.innerHTML = `
			<div class="translation-text">${translatedText}</div>
			<div class="translation-badge">Traduzido</div>
		`;
    return translationDiv;
}
function isAlreadyTranslated(element) {
    if (element.hasAttribute(PROCESSED_ATTRIBUTE))
        return true;
    const nextSibling = element.nextElementSibling;
    if (nextSibling?.classList.contains('telegram-translation'))
        return true;
    let parent = element.parentElement;
    while (parent) {
        if (parent.hasAttribute(PROCESSED_ATTRIBUTE))
            return true;
        parent = parent.parentElement;
    }
    return false;
}
function markAsTranslated(element) {
    element.setAttribute(PROCESSED_ATTRIBUTE, 'true');
}
function shouldIgnoreText(text) {
    if (text.length < 2)
        return true;
    if (!/[a-zA-Z]/.test(text))
        return true;
    if (text.trim().length <= 1)
        return true;
    const portugueseIndicators = ['não', 'que', 'para', 'com', 'isso', 'você', 'ele', 'ela'];
    const lowerText = text.toLowerCase();
    const hasPortuguese = portugueseIndicators.some((word) => lowerText.includes(` ${word} `) || lowerText.startsWith(word + ' ') || lowerText.endsWith(' ' + word));
    if (hasPortuguese) {
        console.log('🇧🇷 Detectado português, ignorando:', text);
        return true;
    }
    console.log('✅ Texto aprovado para tradução:', text);
    return false;
}
async function processMessages() {
    if (!contentIsEnabled) {
        console.log('Tradução desabilitada');
        return;
    }
    console.log('Processando mensagens...');
    const messageSelectors = [
        '.message-content .text-content',
        '.message .text-content',
        '.bubble .text-content',
        '[data-message-id] .text-content',
        '.text-content',
    ];
    let allMessages = [];
    for (const selector of messageSelectors) {
        const messages = document.querySelectorAll(selector);
        console.log(`Seletor "${selector}" encontrou ${messages.length} mensagens`);
        allMessages.push(...Array.from(messages));
    }
    const uniqueMessages = Array.from(new Set(allMessages));
    const seenTexts = new Set();
    const filteredMessages = uniqueMessages.filter((msg) => {
        const text = msg.textContent?.trim() || '';
        const key = `${text}_${msg.getBoundingClientRect().top}`;
        if (seenTexts.has(key))
            return false;
        seenTexts.add(key);
        return true;
    });
    const lastMessages = filteredMessages.slice(-10);
    console.log(`Total de mensagens únicas: ${uniqueMessages.length}, filtradas: ${filteredMessages.length}, processando APENAS últimas: ${lastMessages.length}`);
    for (const message of lastMessages) {
        if (!isValidChatMessage(message)) {
            console.log('Elemento não é mensagem válida, ignorando:', message.textContent?.substring(0, 50));
            continue;
        }
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
        if (shouldIgnoreText(text)) {
            console.log('Texto ignorado');
            markAsTranslated(message);
            continue;
        }
        try {
            console.log('Traduzindo:', text);
            const translation = await translateText(text, 'en', 'pt');
            console.log('Tradução recebida:', translation);
            if (translation !== text && translation.toLowerCase() !== text.toLowerCase()) {
                console.log('Adicionando tradução à interface');
                const translationElement = createTranslationElement(text, translation);
                message.parentNode?.insertBefore(translationElement, message.nextSibling);
                markAsTranslated(message);
            }
            else {
                console.log('Tradução igual ao original, não adicionando');
                markAsTranslated(message);
            }
        }
        catch (error) {
            console.error('Erro ao processar mensagem:', error);
            markAsTranslated(message);
        }
    }
}
async function processNewMessages(newNodes) {
    if (!contentIsEnabled)
        return;
    console.log('🚀 Processando mensagens em tempo real...', newNodes.length);
    for (const node of Array.from(newNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            const messageSelectors = [
                '.message-content .text-content',
                '.message .text-content',
                '.bubble .text-content',
                '[data-message-id] .text-content',
                '.text-content',
            ];
            for (const selector of messageSelectors) {
                const messages = element.matches(selector) ? [element] : Array.from(element.querySelectorAll(selector));
                for (const message of messages) {
                    if (isValidChatMessage(message)) {
                        await processMessageInRealTime(message);
                    }
                }
            }
        }
    }
}
function isValidChatMessage(element) {
    const text = element.textContent?.trim();
    if (!text || text.length < 2)
        return false;
    const isInSidebar = element.closest('.sidebar-left') || element.closest('.chat-list') || element.closest('.left-column');
    if (isInSidebar)
        return false;
    const isInHeader = element.closest('.chat-info') || element.closest('.topbar') || element.closest('.pin-container');
    if (isInHeader)
        return false;
    const uiTexts = ['last seen', 'visto por último', 'online', 'digitando', 'typing'];
    const lowerText = text.toLowerCase();
    if (uiTexts.some((ui) => lowerText === ui || lowerText.startsWith(ui)))
        return false;
    return true;
}
async function processMessageInRealTime(message) {
    if (!message.textContent || isAlreadyTranslated(message)) {
        return;
    }
    if (!isValidChatMessage(message)) {
        return;
    }
    const text = message.textContent.trim();
    const messageType = message.closest('.message.own') || message.closest('.message.is-out') ? 'ENVIADA' : 'RECEBIDA';
    console.log(`📝 ${messageType} - Nova mensagem detectada:`, text);
    if (shouldIgnoreText(text)) {
        console.log('⏭️ Texto ignorado:', text);
        markAsTranslated(message);
        return;
    }
    try {
        console.log(`🔄 Traduzindo mensagem ${messageType}:`, text);
        const translation = await translateText(text, 'en', 'pt');
        console.log('✅ Tradução recebida:', translation);
        if (translation &&
            translation !== text &&
            translation.toLowerCase() !== text.toLowerCase() &&
            translation.length > 1) {
            console.log(`➕ Adicionando tradução ${messageType} à interface`);
            const translationElement = createTranslationElement(text, translation);
            translationElement.style.opacity = '0';
            translationElement.style.transform = 'translateY(-10px)';
            message.parentNode?.insertBefore(translationElement, message.nextSibling);
            setTimeout(() => {
                translationElement.style.transition = 'all 0.3s ease';
                translationElement.style.opacity = '1';
                translationElement.style.transform = 'translateY(0)';
            }, 50);
            markAsTranslated(message);
        }
        else {
            console.log('🔄 Tradução não válida ou igual ao original:', translation, 'vs', text);
            markAsTranslated(message);
        }
    }
    catch (error) {
        console.error('❌ Erro ao processar mensagem nova:', error);
        markAsTranslated(message);
    }
}
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
            clearTimeout(translateTimeout);
            translateTimeout = setTimeout(() => {
                console.log('🔍 Observer detectou mudanças, processando...');
                processNewMessages(mutation.addedNodes);
            }, 100);
        }
    });
});
const textObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
            const target = mutation.target;
            if (target &&
                (target.classList?.contains('text-content') ||
                    target.closest?.('.text-content') ||
                    target.closest?.('.message') ||
                    target.closest?.('.bubble'))) {
                const messageElement = target.closest?.('.text-content') || target;
                if (messageElement && messageElement.textContent && !isAlreadyTranslated(messageElement)) {
                    if (isValidChatMessage(messageElement)) {
                        console.log('📝 Text observer detectou mudança, processando...');
                        setTimeout(() => {
                            processMessageInRealTime(messageElement);
                        }, 200);
                    }
                }
            }
        }
    });
});
function initialize() {
    console.log('🚀 Telegram Translator iniciado - MODO TEMPO REAL!');
    injectTranslationStyles();
    chrome.storage.sync.get(['isEnabled'], (result) => {
        if (result.isEnabled === undefined) {
            chrome.storage.sync.set({ isEnabled: true }, () => {
                console.log('Configuração padrão salva: ativo');
            });
        }
    });
    console.log('🎯 Aguardando novas mensagens em tempo real...');
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
    textObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });
    console.log('✅ Sistema de tradução em tempo real ativado!');
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
}
else {
    setTimeout(initialize, 1000);
}
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isEnabled)
        contentIsEnabled = changes.isEnabled.newValue;
});
