export class TokenHistoricPrice {
    value: number;
    label: string;
};

export class TokenHistoricPriceArray {
    yearly_values: TokenHistoricPrice[];
    monthly_values: TokenHistoricPrice[];
    weekly_values: TokenHistoricPrice[];
    daily_values: TokenHistoricPrice[];
}

export class TokenHistoricPriceArrayWithSymbol extends TokenHistoricPriceArray {
    symbol: string;
}

export class Status {
    exitCode: number
    message: string
}