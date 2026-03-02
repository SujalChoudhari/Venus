import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

const extractorMock = mock(async () => ({ data: new Float32Array([1, 2, 3, 4]) }));
const pipelineMock = mock(async () => extractorMock);

mock.module("@xenova/transformers", () => ({
  pipeline: pipelineMock,
}));

const embeddings = await import("../../../src/core/memory/embeddings");

describe("memory embeddings", () => {
  beforeEach(() => {
    extractorMock.mockClear();
    pipelineMock.mockClear();
  });

  it("builds and caches pipeline", async () => {
    extractorMock
      .mockResolvedValueOnce({ data: new Float32Array([1, 2, 3, 4]) })
      .mockResolvedValueOnce({ data: new Float32Array([4, 3, 2, 1]) });

    const v1 = await embeddings.generateEmbedding("alpha");
    const v2 = await embeddings.generateEmbedding("beta");

    expect(v1).toEqual([1, 2, 3, 4]);
    expect(v2).toEqual([4, 3, 2, 1]);
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock).toHaveBeenCalledWith(
      "feature-extraction",
      embeddings.EMBEDDING_MODEL,
    );
  });

  it("warns on unexpected vector length", async () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    extractorMock.mockResolvedValueOnce({ data: new Float32Array([9]) });

    await embeddings.generateEmbedding("short");

    expect(warnSpy).toHaveBeenCalledWith(
      "[Embeddings] Unexpected vector length: 1 (expected 384)",
    );
    warnSpy.mockRestore();
  });

  it("calculates cosine similarity", () => {
    expect(embeddings.cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(embeddings.cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  afterAll(() => {
    mock.restore();
  });
});
