export interface Move{
    idMove : number;
    name : string;
    pp : number;
    power? : number | null;
    idMoveHubspot? : number | null;
}

export interface MoveDBRow{
    id_move : number;
    name : string;
    pp : number;
    power : number;
    id_move_hubspot? : number | null;
}