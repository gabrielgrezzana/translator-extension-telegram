// Função para traduzir manualmente PT → EN
async function translateManual(): Promise<void> {
	const textToTranslate = translatorInput.value.trim();

	if (!textToTranslate) {
		alert('Por favor, digite um texto para traduzir');
		return;
	}

	// Desabilita botão e mostra loading
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

		// Feedback visual de sucesso
		translateBtn.style.background = '#4CAF50';
		translateBtn.textContent = '✅ Traduzido!';
	} catch (error) {
		console.error('Erro na tradução manual:', error);
		translatorOutput.value = 'Erro ao traduzir. Tente novamente.';

		// Feedback visual de erro
		translateBtn.style.background = '#f44336';
		translateBtn.textContent = '❌ Erro';
	} finally {
		// Restaura botão após 2 segundos
		setTimeout(() => {
			translateBtn.disabled = false;
			translateBtn.textContent = '🌐 Traduzir PT → EN';
			translateBtn.style.background = '';
		}, 2000);
	}
} // Elementos da interface
const enableSwitch = document.getElementById('enableSwitch') as HTMLElement;
const statusText = document.getElementById('statusText') as HTMLElement;
const statusDiv = document.getElementById('status') as HTMLElement;
const translatedCountSpan = document.getElementById('translatedCount') as HTMLElement;
const cacheSizeSpan = document.getElementById('cacheSize') as HTMLElement;
const groqApiKeyInput = document.getElementById('groqApiKey') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('saveApiKey') as HTMLButtonElement;

// Elementos do tradutor manual
const translatorInput = document.getElementById('translatorInput') as HTMLTextAreaElement;
const translatorOutput = document.getElementById('translatorOutput') as HTMLTextAreaElement;
const translateBtn = document.getElementById('translateBtn') as HTMLButtonElement;

// Estado atual do popup
let popupIsEnabled = true; // Padrão: sempre ativo
let groqApiKey = '';

// API Key fixa do Groq (mesma do content script)
const GROQ_API_KEY_FIXED = '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';

// Carrega configurações salvas
function loadSettings(): void {
	chrome.storage.sync.get(['isEnabled', 'groqApiKey', 'translatedCount', 'cacheSize'], (result) => {
		// Se não tem configuração salva, assume que está ativo
		popupIsEnabled = result.isEnabled !== false;
		groqApiKey = result.groqApiKey || '';

		console.log(
			'Configuração carregada:',
			popupIsEnabled,
			'API Key:',
			groqApiKey ? 'Configurada' : 'Não configurada'
		);

		// Atualiza o input da API key (mostra apenas parte por segurança)
		if (groqApiKey) {
			groqApiKeyInput.value = groqApiKey.substring(0, 8) + '...';
			groqApiKeyInput.placeholder = 'API Key configurada ✅';
		}

		updateUI();
		updateStats(result.translatedCount || 0, result.cacheSize || 0);
	});
}

// Atualiza a interface
function updateUI(): void {
	// Toggle switch principal
	if (popupIsEnabled) {
		enableSwitch.classList.add('active');
		if (groqApiKey) {
			statusText.textContent = 'Ativo - Traduzindo com Groq AI 🤖';
			statusDiv.className = 'status enabled';
		} else {
			statusText.textContent = 'Configure sua API Key do Groq primeiro';
			statusDiv.className = 'status warning';
		}
	} else {
		enableSwitch.classList.remove('active');
		statusText.textContent = 'Inativo';
		statusDiv.className = 'status disabled';
	}
}

// Atualiza estatísticas
function updateStats(translatedCount: number, cacheSize: number): void {
	translatedCountSpan.textContent = translatedCount.toString();
	cacheSizeSpan.textContent = cacheSize.toString();
}

// Salva configurações
function saveSettings(): void {
	chrome.storage.sync.set(
		{
			isEnabled: popupIsEnabled,
			groqApiKey: groqApiKey,
		},
		() => {
			console.log('Configuração salva:', popupIsEnabled, 'API Key:', groqApiKey ? 'Salva' : 'Removida');
		}
	);
}

// Salva API Key do Groq
function saveGroqApiKey(): void {
	const newApiKey = groqApiKeyInput.value.trim();

	if (!newApiKey || newApiKey.includes('...')) {
		alert('Por favor, insira sua API Key do Groq');
		return;
	}

	// Valida formato básico da API key
	if (!newApiKey.startsWith('gsk_')) {
		alert('API Key do Groq deve começar com "gsk_"');
		return;
	}

	groqApiKey = newApiKey;
	saveSettings();

	// Feedback visual
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

// Event listeners
enableSwitch.addEventListener('click', () => {
	popupIsEnabled = !popupIsEnabled;
	console.log('Toggle clicado, novo estado:', popupIsEnabled);
	updateUI();
	saveSettings();

	// Notifica o content script sobre a mudança
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

// Tradutor manual
translateBtn.addEventListener('click', translateManual);

// Enter na API key também salva
groqApiKeyInput.addEventListener('keypress', (e) => {
	if (e.key === 'Enter') {
		saveGroqApiKey();
	}
});

// Ctrl+Enter no tradutor para traduzir rápido
translatorInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && e.ctrlKey) {
		e.preventDefault();
		translateManual();
	}
});

// Limpa o input quando clicado se tem valor mascarado
groqApiKeyInput.addEventListener('focus', () => {
	if (groqApiKeyInput.value.includes('...')) {
		groqApiKeyInput.value = '';
		groqApiKeyInput.placeholder = 'Cole sua API Key do Groq aqui...';
	}
});

// Atualiza estatísticas periodicamente
function updateStatsFromStorage(): void {
	chrome.storage.local.get(['translatedCount', 'cacheSize'], (result) => {
		updateStats(result.translatedCount || 0, result.cacheSize || 0);
	});
}

// Inicializa quando o popup abre
document.addEventListener('DOMContentLoaded', () => {
	loadSettings();
	updateStatsFromStorage();

	// Atualiza stats a cada 2 segundos
	setInterval(updateStatsFromStorage, 2000);
});

// Verifica se está na página do Telegram
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
	const currentTab = tabs[0];
	if (currentTab.url && !currentTab.url.includes('web.telegram.org')) {
		// Mostra aviso se não estiver no Telegram
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
