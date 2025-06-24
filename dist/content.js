"use strict";
const translationCache = new Map();
let contentSourceLanguage = 'en';
let contentTargetLanguage = 'pt';
let contentIsEnabled = true;
const GROQ_API_KEY_FIXED = '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';
let translateTimeout;
chrome.storage.sync.get(['isEnabled'], (result) => {
    contentIsEnabled = result.isEnabled !== false;
    console.log('Content script - Configurações carregadas - Ativo:', contentIsEnabled);
    if (contentIsEnabled) {
        setTimeout(processMessages, 2000);
    }
});
async function translateText(text, from = 'en', to = 'pt') {
    const cacheKey = `${text}_${from}_${to}`;
    if (translationCache.has(cacheKey)) {
        console.log('Usando tradução do cache:', text.substring(0, 30));
        return translationCache.get(cacheKey);
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
        translationCache.set(cacheKey, translation);
        updateTranslationStats();
        return translation;
    }
    catch (error) {
        console.error('Erro na tradução via Groq:', error);
        return text;
    }
}
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
function createTranslationElement(originalText, translatedText) {
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
function isAlreadyTranslated(element) {
    return element.nextElementSibling?.classList.contains('telegram-translation') === true;
}
async function processMessages() {
    if (!contentIsEnabled) {
        console.log('Tradução desabilitada');
        return;
    }
    console.log('Processando mensagens...');
    const messageSelectors = [
        '.message-content .text-content',
        '.message .text',
        '.message-text',
        '[data-message-id] .text-content',
        '.text-content',
        '.message .text-content',
        '.bubble .text-content',
    ];
    let allMessages = [];
    for (const selector of messageSelectors) {
        const messages = document.querySelectorAll(selector);
        console.log(`Seletor "${selector}" encontrou ${messages.length} mensagens`);
        allMessages.push(...Array.from(messages));
    }
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
        if (text.length < 3) {
            console.log('Texto muito curto, ignorando');
            continue;
        }
        if (/^[\d\s\p{Emoji}\p{Symbol}\p{Punctuation}]+$/u.test(text)) {
            console.log('Texto contém apenas números/símbolos/emojis, ignorando');
            continue;
        }
        const shouldTranslate = true;
        if (!shouldTranslate) {
            console.log('Não vai traduzir');
            continue;
        }
        try {
            console.log('Iniciando tradução:', text);
            const translation = await translateText(text, 'en', 'pt');
            console.log('Tradução concluída:', translation);
            if (translation !== text && translation.toLowerCase() !== text.toLowerCase()) {
                console.log('Adicionando tradução à interface');
                const translationElement = createTranslationElement(text, translation);
                message.parentNode?.insertBefore(translationElement, message.nextSibling);
            }
            else {
                console.log('Tradução igual ao original, não adicionando');
            }
        }
        catch (error) {
            console.error('Erro ao processar mensagem:', error);
        }
    }
}
async function processNewMessages(newNodes) {
    if (!contentIsEnabled)
        return;
    for (const node of Array.from(newNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            const messageSelectors = [
                '.message-content .text-content',
                '.message .text',
                '.message-text',
                '.text-content',
            ];
            for (const selector of messageSelectors) {
                const messages = element.matches(selector) ? [element] : Array.from(element.querySelectorAll(selector));
                for (const message of messages) {
                    if (!message.textContent || isAlreadyTranslated(message))
                        continue;
                    const text = message.textContent.trim();
                    if (text.length < 3)
                        continue;
                    if (/^[\d\s\p{Emoji}\p{Symbol}\p{Punctuation}]+$/u.test(text))
                        continue;
                    try {
                        const translation = await translateText(text, 'en', 'pt');
                        if (translation !== text && translation.toLowerCase() !== text.toLowerCase()) {
                            const translationElement = createTranslationElement(text, translation);
                            message.parentNode?.insertBefore(translationElement, message.nextSibling);
                        }
                    }
                    catch (error) {
                        console.error('Erro ao processar mensagem nova:', error);
                    }
                }
            }
        }
    }
}
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
            clearTimeout(translateTimeout);
            translateTimeout = setTimeout(() => {
                processNewMessages(mutation.addedNodes);
            }, 500);
        }
    });
});
function initialize() {
    console.log('Telegram Translator com Groq AI iniciado!');
    chrome.storage.sync.get(['isEnabled'], (result) => {
        if (result.isEnabled === undefined) {
            chrome.storage.sync.set({ isEnabled: true }, () => {
                console.log('Configuração padrão salva: ativo');
            });
        }
    });
    if (contentIsEnabled) {
        processMessages();
    }
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
}
else {
    setTimeout(initialize, 1000);
}
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isEnabled) {
        contentIsEnabled = changes.isEnabled.newValue;
        console.log('Estado da tradução alterado para:', contentIsEnabled);
    }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Mensagem recebida no content script:', message);
    if (message.action === 'toggleTranslation') {
        contentIsEnabled = message.enabled;
        console.log('Tradução toggled via popup para:', contentIsEnabled);
        sendResponse({ success: true, enabled: contentIsEnabled });
    }
});
