import * as d3 from 'd3';

/** GraphStatus: The visualization status of a graph. */
export interface GraphStatus<T> {
    /** Graph: The graph. */
    Graph: Graph<T>;
    /** ChosenNodes: The selected nodes. */
    ChosenNodes: Node<T>[];
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
    ID: number;
    /** Representative: The representative node of the component. */
    Representative?: Node<T>;
    /** Nodes: The nodes in the component. */
    Nodes: Node<T>[];
    /** CurrentNodes: The current nodes in the component. */
    CurrentNodes?: Node<T>[];
    /** Hull: The convex hull of the component. */
    Hull?: [number, number][];
    /** Centroid: The centroid of the component. */
    Centroid?: [number, number];
}

/** Node: A node in the graph. */
export interface Node<T> extends d3.SimulationNodeDatum {
    /** ID: The unique identifier of the node. */
    ID: string;
    /** Data: The data associated with the node. */
    Data: T;
    /** Type: The type of the data. */
    Type: string;
    /** Size: The visualize size of the node. */
    Size?: number;
    /** Hidden: Whether the node should be hidden under the current circumstance. */
    Hidden?: boolean;
    /** Owners: Owners of this node. */
    Owners: Set<number>;
    /** NearOwners: Owners that own at least a close neighbor nodes to this node. */
    NearOwners: Set<number>;
    /** Neighbors: Close neighbors of this node. */
    Neighbors: number;
    /** Weights: Weights (for each codebook) of this node. */
    Weights: number[];
    /** TotalWeight: The total weight of this code. */
    TotalWeight: number;
    /** Links: Links connected to this node. */
    Links: Link<T>[];
    /** Component: The component that the node belongs to. */
    Component?: Component<T>;
}

/** Link: A link between two nodes in the graph. */
export interface Link<T> extends d3.SimulationLinkDatum<Node<T>> {
    /** Source: The source node. */
    Source: Node<T>;
    /** Target: The target node. */
    Target: Node<T>;
    /** Distance: The distance of the link. */
    Distance: number;
    /** VisualizeDistance: The distance of the link for force-directed graphs. */
    VisualizeDistance?: number;
    /** Weight: The weight of the link. */
    Weight?: number;
    /** VisualizeWeight: The weight of the link for force-directed graphs. */
    VisualizeWeight?: number;
    /** Hidden: Whether the link should be hidden under the current circumstance. */
    Hidden?: boolean;
}