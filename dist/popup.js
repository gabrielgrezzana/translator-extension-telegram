"use strict";
async function translateManual() {
    const textToTranslate = translatorInput.value.trim();
    if (!textToTranslate) {
        alert('Por favor, digite um texto para traduzir');
        return;
    }
    translateBtn.disabled = true;
    translateBtn.textContent = '🔄 Traduzindo...';
    translatorOutput.value = 'Traduzindo...';
    try {
        const prompt = `Você é um tradutor especializado. Traduza o seguinte texto do português brasileiro para inglês de forma natural e fluente.

REGRAS:
- Mantenha o tom e contexto original
- Use inglês americano padrão
- Se já estiver em inglês, mantenha como está
- Retorne APENAS a tradução, sem explicações

TEXTO PARA TRADUZIR:
${textToTranslate}

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
                max_tokens: 500,
                top_p: 1,
                stream: false,
            }),
        });
        if (!response.ok) {
            throw new Error(`Erro na API: ${response.status}`);
        }
        const data = await response.json();
        const translation = data.choices[0]?.message?.content?.trim();
        if (!translation) {
            throw new Error('Resposta vazia do Groq');
        }
        translatorOutput.value = translation;
        translateBtn.style.background = '#4CAF50';
        translateBtn.textContent = '✅ Traduzido!';
    }
    catch (error) {
        console.error('Erro na tradução manual:', error);
        translatorOutput.value = 'Erro ao traduzir. Tente novamente.';
        translateBtn.style.background = '#f44336';
        translateBtn.textContent = '❌ Erro';
    }
    finally {
        setTimeout(() => {
            translateBtn.disabled = false;
            translateBtn.textContent = '🌐 Traduzir PT → EN';
            translateBtn.style.background = '';
        }, 2000);
    }
}
const enableSwitch = document.getElementById('enableSwitch');
const statusText = document.getElementById('statusText');
const statusDiv = document.getElementById('status');
const translatedCountSpan = document.getElementById('translatedCount');
const cacheSizeSpan = document.getElementById('cacheSize');
const groqApiKeyInput = document.getElementById('groqApiKey');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const translatorInput = document.getElementById('translatorInput');
const translatorOutput = document.getElementById('translatorOutput');
const translateBtn = document.getElementById('translateBtn');
let popupIsEnabled = true;
let groqApiKey = '';
const GROQ_API_KEY_FIXED = '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';
function loadSettings() {
    chrome.storage.sync.get(['isEnabled', 'groqApiKey', 'translatedCount', 'cacheSize'], (result) => {
        popupIsEnabled = result.isEnabled !== false;
        groqApiKey = result.groqApiKey || '';
        console.log('Configuração carregada:', popupIsEnabled, 'API Key:', groqApiKey ? 'Configurada' : 'Não configurada');
        if (groqApiKey) {
            groqApiKeyInput.value = groqApiKey.substring(0, 8) + '...';
            groqApiKeyInput.placeholder = 'API Key configurada ✅';
        }
        updateUI();
        updateStats(result.translatedCount || 0, result.cacheSize || 0);
    });
}
function updateUI() {
    if (popupIsEnabled) {
        enableSwitch.classList.add('active');
        if (groqApiKey) {
            statusText.textContent = 'Ativo - Traduzindo com Groq AI 🤖';
            statusDiv.className = 'status enabled';
        }
        else {
            statusText.textContent = 'Configure sua API Key do Groq primeiro';
            statusDiv.className = 'status warning';
        }
    }
    else {
        enableSwitch.classList.remove('active');
        statusText.textContent = 'Inativo';
        statusDiv.className = 'status disabled';
    }
}
function updateStats(translatedCount, cacheSize) {
    translatedCountSpan.textContent = translatedCount.toString();
    cacheSizeSpan.textContent = cacheSize.toString();
}
function saveSettings() {
    chrome.storage.sync.set({
        isEnabled: popupIsEnabled,
        groqApiKey: groqApiKey,
    }, () => {
        console.log('Configuração salva:', popupIsEnabled, 'API Key:', groqApiKey ? 'Salva' : 'Removida');
    });
}
function saveGroqApiKey() {
    const newApiKey = groqApiKeyInput.value.trim();
    if (!newApiKey || newApiKey.includes('...')) {
        alert('Por favor, insira sua API Key do Groq');
        return;
    }
    if (!newApiKey.startsWith('gsk_')) {
        alert('API Key do Groq deve começar com "gsk_"');
        return;
    }
    groqApiKey = newApiKey;
    saveSettings();
    saveApiKeyBtn.textContent = 'Salva ✅';
    saveApiKeyBtn.style.background = '#4CAF50';
    setTimeout(() => {
        saveApiKeyBtn.textContent = 'Salvar API Key';
        saveApiKeyBtn.style.background = '';
        groqApiKeyInput.value = newApiKey.substring(0, 8) + '...';
        groqApiKeyInput.placeholder = 'API Key configurada ✅';
        updateUI();
    }, 2000);
}
enableSwitch.addEventListener('click', () => {
    popupIsEnabled = !popupIsEnabled;
    console.log('Toggle clicado, novo estado:', popupIsEnabled);
    updateUI();
    saveSettings();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'toggleTranslation',
                enabled: popupIsEnabled,
            });
        }
    });
});
saveApiKeyBtn.addEventListener('click', saveGroqApiKey);
translateBtn.addEventListener('click', translateManual);
groqApiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveGroqApiKey();
    }
});
translatorInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        translateManual();
    }
});
groqApiKeyInput.addEventListener('focus', () => {
    if (groqApiKeyInput.value.includes('...')) {
        groqApiKeyInput.value = '';
        groqApiKeyInput.placeholder = 'Cole sua API Key do Groq aqui...';
    }
});
function updateStatsFromStorage() {
    chrome.storage.local.get(['translatedCount', 'cacheSize'], (result) => {
        updateStats(result.translatedCount || 0, result.cacheSize || 0);
    });
}
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    updateStatsFromStorage();
    setInterval(updateStatsFromStorage, 2000);
});
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (currentTab.url && !currentTab.url.includes('web.telegram.org')) {
        const warning = document.createElement('div');
        warning.style.cssText = `
			background: rgba(255, 193, 7, 0.2);
			border: 1px solid rgba(255, 193, 7, 0.5);
			color: #fff;
			padding: 10px;
			margin: 10px 0;
			border-radius: 6px;
			font-size: 12px;
			text-align: center;
		`;
        warning.innerHTML = '⚠️ Abra o Telegram Web para usar a extensão';
        const content = document.querySelector('.content');
        if (content) {
            content.insertBefore(warning, content.firstChild);
        }
    }
});
