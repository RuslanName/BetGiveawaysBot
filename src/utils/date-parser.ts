export const parseDate = (dateString: string): Date | null => {
    const formats = [
        /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/,
        /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/,
        /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/
    ];

    for (const format of formats) {
        const match = dateString.match(format);
        if (match) {
            if (format === formats[0]) {
                const [, day, month, year, hour, minute] = match;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
            } else if (format === formats[1]) {
                const [, month, day, year, hour, minute] = match;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
            } else {
                const [, year, month, day, hour, minute] = match;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
            }
        }
    }

    return null;
};

export const formatDate = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
};

