/**
 * Normaliza uma string removendo acentos e convertendo para minúsculas.
 * Útil para buscas que ignoram acentos e capitalização.
 */
export const normalizeString = (str: string | null | undefined): string => {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
};

/**
 * Verifica se a string 'target' contém a string 'search' ignorando acentos.
 */
export const includesNormalized = (target: string | null | undefined, search: string | null | undefined): boolean => {
    return normalizeString(target).includes(normalizeString(search));
};
