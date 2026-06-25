export function parseDateInput(value: string | Date) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid date");
    }
    return date;
}
