export const getWhatsAppLink = (phone: string, message?: string) => {
    if (!phone) return '';
    const cleanPhone = phone.replace(/\D/g, '');
    const baseUrl = `https://api.whatsapp.com/send?phone=55${cleanPhone}`;
    
    if (message) {
        return `${baseUrl}&text=${encodeURIComponent(message)}`;
    }
    return baseUrl;
};

export const processWhatsAppTemplate = (template: string, data: Record<string, string>) => {
    let processed = template;
    Object.entries(data).forEach(([key, value]) => {
        const placeholder = `{${key}}`;
        processed = processed.replace(new RegExp(placeholder, 'g'), value || '');
    });
    return processed;
};

export const openWhatsApp = (phone: string, message?: string) => {
    const link = getWhatsAppLink(phone, message);
    if (link) window.open(link, '_blank');
};
