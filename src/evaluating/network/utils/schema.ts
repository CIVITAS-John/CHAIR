import type * as d3 from "d3";

/** The visualization status of a graph. */
export interface GraphStatus<T> {
    /** The graph. */
    graph: Graph<T>;
    /** The selected nodes. */
    chosenNodes: Node<T>[];
}

/** A graph. */
export interface Graph<T> {
    /** The nodes in the graph. */
    nodes: Node<T>[];
    /** The links in the graph. */
    links: Link<T>[];
    /** The maximum distance in the graph. */
    maxDist: number;
    /** The minimum distance in the graph. */
    minDist: number;
    /** The connected components in the graph. */
    components?: Component<T>[];
}

/** A connected component in the graph. */
export interface Component<T> {
    /** The unique identifier of the component. */
    id: number;
    /** The representative node of the component. */
    representative?: Node<T>;
    /** The nodes in the component. */
    nodes: Node<T>[];
    /** The current nodes in the component. */
    curNodes?: Node<T>[];
    /** The convex hull of the component. */
    hull?: [number, number][];
    /** The centroid of the component. */
    centroid?: [number, number];
}

/** Node: A node in the graph. */
export interface Node<T> extends d3.SimulationNodeDatum {
    /** The index of the node (for using the distance matrix). */
    index: number;
    /** The unique identifier of the node. */
    id: string;
    /** The data associated with the node. */
    data: T;
    /** The type of the data. */
    type: string;
    /** The visualize size of the node. */
    size?: number;
    /** Whether the node should be hidden under the current circumstance. */
    hidden?: boolean;
    /** Owners of this node. */
    owners: Set<number>;
    /** Owners that own at least a close neighbor nodes to this node. */
    nearOwners: Set<number>;
    /** The novelty of the node. */
    novelty?: number;
    /** Close neighbors of this node. */
    neighbors: number;
    /** Weights (for each codebook) of this node, ranging between 0 (not covered) - 1 (has it). */
    weights: number[];
    /** The total weight of this code. */
    totalWeight: number;
    /** Links connected to this node. */
    links: Link<T>[];
    /** The component that the node belongs to. */
    component?: Component<T>;
}

/** A link between two nodes in the graph. */
export interface Link<T> extends d3.SimulationLinkDatum<Node<T>> {
    /** The source node. */
    source: Node<T>;
    /** The target node. */
    target: Node<T>;
    /** The distance of the link. */
    distance: number;
    /** The distance of the link for force-directed graphs. */
    visualizeDistance?: number;
    /** The weight of the link. */
    weight?: number;
    /** The weight of the link for force-directed graphs. */
    visualizeWeight?: number;
    /** Whether the link should be hidden under the current circumstance. */
    hidden?: boolean;
}
