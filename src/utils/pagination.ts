export const createPaginationKeyboard = (currentPage: number, totalPages: number, callbackPrefix: string, additionalButtons: any[] = []) => {
    const buttons: any[] = [];
    
    if (totalPages <= 1) {
        return { inline_keyboard: additionalButtons.length > 0 ? [additionalButtons] : [] };
    }

    const navButtons: any[] = [];
    
    if (currentPage > 1) {
        navButtons.push({ text: '◀️', callback_data: `${callbackPrefix}:page:${currentPage - 1}` });
    }
    
    if (currentPage < totalPages) {
        navButtons.push({ text: '▶️', callback_data: `${callbackPrefix}:page:${currentPage + 1}` });
    }

    if (navButtons.length > 0) {
        buttons.push(navButtons);
    }

    if (additionalButtons.length > 0) {
        buttons.push(additionalButtons);
    }

    return { inline_keyboard: buttons };
};

