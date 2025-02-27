export class ComptaMetadata {
    tableName: string;
    columns: DataColumn[];
    sheetName: string;
    acronyms: string[];

    constructor(tableName: string, columns: DataColumn[], sheetName: string, acronyms: string[]) {
        this.tableName = tableName;
        this.columns = columns;
        this.sheetName = sheetName;
        this.acronyms = acronyms;
        if (this.acronyms.length >= 2) {
            var composedAcronyms = this.acronyms.reduce<string>((prev, cur) => {
                return prev + cur[0];
            }, '');
            this.acronyms = [...this.acronyms, composedAcronyms];
        }
    }

    getColumnIndex(name: string): Number | undefined {
        return this.columns.find(c => c.name === name)?.index;
    }

    acronymsMatch(acronym: string): boolean {
        return this.acronyms.includes(acronym);
    }

    static findMetadataByAcronym(acronym: string, metadata: ComptaMetadata[]): ComptaMetadata | undefined {
        return metadata.find(m => m.acronymsMatch(acronym));
    }
}



export interface DataColumn {
    index: Number,
    name: string;
}

export type DataType = String | Number | Date | Libelle;

export interface DataIndex {
    tableName: string,
    index: number,
    data: DataType[][]
}

export interface DataVerificationEntry {
    tableName: string,
    data: DataType[];
}
export interface DataVerification {
    index: number,
    journalEntry: DataType[],
    foundEntries: DataVerificationEntry[];
}

export interface MissingDataVerification {
    index: number,
    entryTablename: string,
    entryData: DataType[],
}

export type DataVerificationResult = DataVerification | MissingDataVerification;

export class Libelle {
    sourceAcronym?: string = undefined;
    destinationAcronym?: string = undefined;
    libelle: string = '';
    public readonly value: String;
    constructor(value: String) {
        this.value = value;
        this.parseLibelle();
    }

    private parseLibelle() {
        const libelleSeparator = ' - ';
        const acronymSeparator = ' à ';
        if (this.value.includes(libelleSeparator)) {
            var parts = this.value.split(libelleSeparator, 2);
            this.libelle = parts[1].trim().toString();
            if (parts[0].includes(acronymSeparator)) {
                var acronyms = parts[0].split(acronymSeparator, 2);
                this.sourceAcronym = acronyms[0].trim().toString();
                this.destinationAcronym = acronyms[1].trim().toString();
            }
            else {
                this.sourceAcronym = parts[0].trim().toString();
            }
        }
        else {
            this.libelle = this.value.trim().toString();
        }
    }
    public areEquals(other: Libelle): boolean {    
        return this.libelle === other.libelle && this.sourceAcronym === other.sourceAcronym && this.destinationAcronym === other.destinationAcronym;
    }

}