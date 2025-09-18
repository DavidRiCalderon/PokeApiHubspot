export interface Location{
    idLocation : number;
    name : string;
    numberArea : number;
    region : string;
    generation : string;
    idLocationHubspot?: number | null;
}

export interface LocationDBRow {
    id_location : number;
    name : string;
    number_area : number;
    region : string;
    generation : string;
    id_location_hubspot?: number | null;
}