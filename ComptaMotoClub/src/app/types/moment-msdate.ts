import * as moment from 'moment';

// moment-msdate doesn't provide strong types, so add them here
declare module 'moment' {
    export function fromOADate(oaDate: number, offset?: (string | number)): moment.Moment;
    
    interface Moment {
        toOADate(): number;
    }
}

