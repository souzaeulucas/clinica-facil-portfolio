export const copyToClipboard = async (text: string, label: string, addToast: (msg: string, type: string) => void) => {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        addToast(`${label} copiado!`, 'success');
    } catch (err) {
        console.error('Falha ao copiar:', err);
        addToast('Erro ao copiar para a área de transferência', 'error');
    }
};
