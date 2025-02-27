export function convertExcelDateToJSDate(excelDate: number) {
    // Excel dates are based on 1/1/1900
    var excelEpoch = new Date(1899, 11, 30);
    var jsDate = new Date(excelEpoch.getTime() + excelDate * 86400000);
    return jsDate;
}

export function toNumber(value: string | number): number {
    if (typeof value === "string" && value.trim() === "") {
        return 0; // Default value for empty string
    }
    return Number(value);
}