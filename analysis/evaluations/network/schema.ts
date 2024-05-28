import * as d3 from 'd3';

/** GraphStatus: The visualization status of a graph. */
export interface GraphStatus<T> {
    /** Graph: The graph. */
    Graph: Graph<T>;
    /** ChosenNodes: The selected nodes. */
    ChosenNodes: Node<T>[];
}

/** Colorizer: A colorizer for the graph. */
export interface Colorizer<T> {
    /** Colorize: The colorizer function. */
    Colorize: (Node: Node<T>) => string;
    /** Examples: The examples of the colorizer. */
    Examples: Record<string, string>;
    /** Results: The results of the colorizer. */
    Results?: Record<string, Node<T>[]>;
}

/** Graph: A graph. */
export interface Graph<T> {
    /** Nodes: The nodes in the graph. */
    Nodes: Node<T>[];
    /** Links: The links in the graph. */
    Links: Link<T>[];
    /** MaximumDistance: The maximum distance in the graph. */
    MaximumDistance: number;
    /** MinimumDistance: The minimum distance in the graph. */
    MinimumDistance: number;
    /** Components: The connected components in the graph. */
    Components?: Component<T>[];
}

/** Component: A connected component in the graph. */
export interface Component<T> {
    /** ID: The unique identifier of the component. */
    ID: string;
    /** Representative: The representative node of the component. */
    Representative?: Node<T>;
    /** Nodes: The nodes in the component. */
    Nodes: Node<T>[];
    /** CurrentNodes: The current nodes in the component. */
    CurrentNodes?: Node<T>[];
}

/** Node: A node in the graph. */
export interface Node<T> extends d3.SimulationNodeDatum {
    /** ID: The unique identifier of the node. */
    ID: string;
    /** Data: The data associated with the node. */
    Data: T;
    /** Type: The type of the data. */
    Type: string;
    /** Hidden: Whether the node should be hidden under the current circumstance. */
    Hidden?: boolean;
    /** Owners: Owners of this node. */
    Owners: Set<number>;
    /** NearOwners: Owners that own at least a close neighbor nodes to this node. */
    NearOwners: Set<number>;
}

/** Link: A link between two nodes in the graph. */
export interface Link<T> extends d3.SimulationLinkDatum<Node<T>> {
    /** Source: The source node. */
    Source: Node<T>;
    /** Target: The target node. */
    Target: Node<T>;
    /** Distance: The distance of the link. */
    Distance: number;
    /** Hidden: Whether the link should be hidden under the current circumstance. */
    Hidden?: boolean;
}