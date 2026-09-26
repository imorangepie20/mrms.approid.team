const MAX_CLUSTERS = 3;
const MAX_ITERATIONS = 50;
const MIN_CLUSTER_SIZE = 10;
const MIN_PROFILE_TRACKS = 15;
const MIN_SILHOUETTE = 0.1;
const MULTI_TASTE_TRACKS = 60;

export type TasteProfileInput = {
  artist: string;
  embedding: number[];
  feedbackWeight?: number;
  playlistCount: number;
  trackId: string;
};

export type TasteCentroid = {
  clusterIndex: 0 | 1 | 2 | 3;
  embedding: number[];
  trackCount: number;
  weight: number;
};

export type TasteProfileResult = {
  centroids: TasteCentroid[];
  uniqueTrackCount: number;
};

type WeightedInput = TasteProfileInput & {
  weight: number;
};

type ClusterResult = {
  assignments: number[];
  centroids: number[][];
  silhouette: number;
};

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(dot(vector, vector));
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error("taste_profile_vector_invalid");
  }
  return vector.map((value) => value / norm);
}

function weightedMean(inputs: WeightedInput[]): number[] {
  const sum = Array.from({ length: inputs[0].embedding.length }, () => 0);
  for (const input of inputs) {
    input.embedding.forEach((value, index) => {
      sum[index] += value * input.weight;
    });
  }
  return normalize(sum);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function initialCentroids(
  inputs: WeightedInput[],
  clusterCount: number,
  seed: number,
): number[][] {
  const random = seededRandom(seed ^ clusterCount);
  const selected = new Set<number>();
  selected.add(Math.floor(random() * inputs.length));

  while (selected.size < clusterCount) {
    const centroids = [...selected].map((index) => inputs[index].embedding);
    const distances = inputs.map((input, index) => {
      if (selected.has(index)) return 0;
      const similarity = Math.max(
        ...centroids.map((centroid) => dot(input.embedding, centroid)),
      );
      return Math.max(1 - similarity, 0);
    });
    const total = distances.reduce((sum, distance) => sum + distance, 0);
    if (total === 0) {
      const next = inputs.findIndex((_input, index) => !selected.has(index));
      selected.add(next);
      continue;
    }
    let threshold = random() * total;
    let next = distances.length - 1;
    for (let index = 0; index < distances.length; index += 1) {
      threshold -= distances[index];
      if (threshold <= 0 && !selected.has(index)) {
        next = index;
        break;
      }
    }
    selected.add(next);
  }
  return [...selected].map((index) => inputs[index].embedding);
}

function assign(inputs: WeightedInput[], centroids: number[][]): number[] {
  return inputs.map((input) => {
    let bestIndex = 0;
    let bestSimilarity = Number.NEGATIVE_INFINITY;
    centroids.forEach((centroid, index) => {
      const similarity = dot(input.embedding, centroid);
      if (similarity > bestSimilarity) {
        bestIndex = index;
        bestSimilarity = similarity;
      }
    });
    return bestIndex;
  });
}

function cosineSilhouette(
  inputs: WeightedInput[],
  assignments: number[],
  clusterCount: number,
): number {
  const clusters = Array.from({ length: clusterCount }, () => [] as number[]);
  assignments.forEach((cluster, index) => clusters[cluster].push(index));
  const scores = inputs.map((input, inputIndex) => {
    const ownCluster = assignments[inputIndex];
    const ownMembers = clusters[ownCluster].filter((index) => index !== inputIndex);
    const ownDistance = ownMembers.reduce(
      (sum, index) => sum + 1 - dot(input.embedding, inputs[index].embedding),
      0,
    ) / ownMembers.length;
    const otherDistance = Math.min(
      ...clusters
        .filter((_cluster, index) => index !== ownCluster)
        .map((members) => members.reduce(
          (sum, index) => sum + 1 - dot(input.embedding, inputs[index].embedding),
          0,
        ) / members.length),
    );
    const scale = Math.max(ownDistance, otherDistance);
    return scale === 0 ? 0 : (otherDistance - ownDistance) / scale;
  });
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function sphericalKMeans(
  inputs: WeightedInput[],
  clusterCount: number,
  seed: number,
): ClusterResult | null {
  let centroids = initialCentroids(inputs, clusterCount, seed);
  let assignments = Array.from({ length: inputs.length }, () => -1);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const nextAssignments = assign(inputs, centroids);
    if (nextAssignments.every((cluster, index) => cluster === assignments[index])) {
      break;
    }
    assignments = nextAssignments;
    const clusters = Array.from({ length: clusterCount }, () => [] as WeightedInput[]);
    assignments.forEach((cluster, index) => clusters[cluster].push(inputs[index]));
    if (clusters.some((cluster) => cluster.length === 0)) return null;
    centroids = clusters.map(weightedMean);
  }

  const sizes = Array.from({ length: clusterCount }, () => 0);
  assignments.forEach((cluster) => { sizes[cluster] += 1; });
  if (sizes.some((size) => size < MIN_CLUSTER_SIZE)) return null;
  const silhouette = cosineSilhouette(inputs, assignments, clusterCount);
  if (silhouette < MIN_SILHOUETTE) return null;
  return { assignments, centroids, silhouette };
}

function uniqueInputs(inputs: TasteProfileInput[]): TasteProfileInput[] {
  const unique = new Map<string, TasteProfileInput>();
  for (const input of inputs) {
    const current = unique.get(input.trackId);
    if (!current || input.playlistCount > current.playlistCount) {
      unique.set(input.trackId, input);
    }
  }
  return [...unique.values()];
}

function weightedInputs(inputs: TasteProfileInput[]): WeightedInput[] {
  const dimensions = inputs[0].embedding.length;
  const artistCounts = new Map<string, number>();
  inputs.forEach((input) => {
    if (
      input.embedding.length !== dimensions
      || input.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error("taste_profile_vector_invalid");
    }
    artistCounts.set(input.artist, (artistCounts.get(input.artist) ?? 0) + 1);
  });
  return inputs.map((input) => {
    const playlistCount = Math.max(1, Math.trunc(input.playlistCount));
    const playlistWeight = 1 + 0.25 * Math.min(playlistCount - 1, 3);
    const artistWeight = 1 / Math.sqrt(artistCounts.get(input.artist) ?? 1);
    const feedbackWeight = input.feedbackWeight ?? 1;
    if (!Number.isFinite(feedbackWeight) || feedbackWeight < 1) {
      throw new Error("taste_profile_feedback_weight_invalid");
    }
    return {
      ...input,
      embedding: normalize(input.embedding),
      weight: playlistWeight * artistWeight * feedbackWeight,
    };
  });
}

export function buildTasteProfile(
  rawInputs: TasteProfileInput[],
  seed = 20260922,
): TasteProfileResult {
  const unique = uniqueInputs(rawInputs);
  if (unique.length < MIN_PROFILE_TRACKS) {
    throw new Error("taste_profile_minimum_not_met");
  }
  const inputs = weightedInputs(unique);
  const centroids: TasteCentroid[] = [{
    clusterIndex: 0,
    embedding: weightedMean(inputs),
    trackCount: inputs.length,
    weight: 1,
  }];

  if (inputs.length >= MULTI_TASTE_TRACKS) {
    let best: ClusterResult | null = null;
    for (let clusterCount = 2; clusterCount <= MAX_CLUSTERS; clusterCount += 1) {
      const candidate = sphericalKMeans(inputs, clusterCount, seed);
      if (candidate && (!best || candidate.silhouette > best.silhouette)) {
        best = candidate;
      }
    }
    if (best) {
      const totalWeight = inputs.reduce((sum, input) => sum + input.weight, 0);
      const clusters = best.centroids.map((embedding, cluster) => {
        const members = inputs.filter((_input, index) =>
          best?.assignments[index] === cluster
        );
        return {
          embedding,
          firstTrackId: members
            .map((input) => input.trackId)
            .sort((left, right) => left.localeCompare(right))[0],
          trackCount: members.length,
          weight: members.reduce((sum, input) => sum + input.weight, 0) / totalWeight,
        };
      });
      clusters.sort((left, right) =>
        right.trackCount - left.trackCount
        || left.firstTrackId.localeCompare(right.firstTrackId)
      );
      clusters.forEach((cluster, index) => {
        centroids.push({
          clusterIndex: (index + 1) as 1 | 2 | 3,
          embedding: cluster.embedding,
          trackCount: cluster.trackCount,
          weight: cluster.weight,
        });
      });
    }
  }

  return { centroids, uniqueTrackCount: inputs.length };
}
