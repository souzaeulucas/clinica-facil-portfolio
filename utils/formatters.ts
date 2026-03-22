export const formatPatientName = (name: string): string => {
    if (!name) return '';

    // Lista de preposições que devem permanecer minúsculas
    const exceptions = ['de', 'da', 'do', 'dos', 'das', 'e'];

    return name
        .toLowerCase()
        .split(' ')
        .map((word, index) => {
            // Se for a primeira palavra, sempre capitaliza
            if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);

            // Se estiver na lista de exceções, mantém minúscula
            if (exceptions.includes(word)) return word;

            // Caso contrário, capitaliza
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
};

export const normalizeText = (text: string): string => {
    if (!text) return '';
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
};

export const includesNormalized = (base: string, search: string): boolean => {
    if (!base || !search) return false;
    return normalizeText(base).includes(normalizeText(search));
};
