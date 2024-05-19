import * as d3 from 'd3';

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
}

/** Node: A node in the graph. */
export interface Node<T> extends d3.SimulationNodeDatum {
    /** ID: The unique identifier of the node. */
    ID: string;
    /** Data: The data associated with the node. */
    Data: T;
    /** Type: The type of the data. */
    Type: string;
    /** NearOwners: Owners that own at least a close neighbor nodes to this node. */
    NearOwners: Set<number>;
}

/** Link: A link between two nodes in the graph. */
export interface Link<T> extends d3.SimulationLinkDatum<Node<T>> {
    /** Source: The source node. */
    Source: Node<T>;
    /** Target: The target node. */
    Target: Node<T>;
    /** Distance: The desired distance of the link. */
    Distance: number;
}