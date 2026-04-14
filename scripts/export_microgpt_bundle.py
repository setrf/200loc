"""
Train Karpathy's microgpt.py and export the browser bundle used by the app.
"""

from __future__ import annotations

import json
import math
import os
import random
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ASSETS = ROOT / "public" / "assets"
TEST_FIXTURES = ROOT / "src" / "test" / "fixtures"
INPUT_PATH = ROOT / "input.txt"
MODEL_PATH = PUBLIC_ASSETS / "microgpt-model.json"
TRACE_FIXTURE_PATH = TEST_FIXTURES / "expected-step-em.json"
NAMES_URL = "https://raw.githubusercontent.com/karpathy/makemore/988aa59/names.txt"

random.seed(42)


class Value:
    __slots__ = ("data", "grad", "_children", "_local_grads")

    def __init__(self, data, children=(), local_grads=()):
        self.data = data
        self.grad = 0
        self._children = children
        self._local_grads = local_grads

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data + other.data, (self, other), (1, 1))

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data * other.data, (self, other), (other.data, self.data))

    def __pow__(self, other):
        return Value(self.data**other, (self,), (other * self.data ** (other - 1),))

    def log(self):
        return Value(math.log(self.data), (self,), (1 / self.data,))

    def exp(self):
        return Value(math.exp(self.data), (self,), (math.exp(self.data),))

    def relu(self):
        return Value(max(0, self.data), (self,), (float(self.data > 0),))

    def __neg__(self):
        return self * -1

    def __radd__(self, other):
        return self + other

    def __sub__(self, other):
        return self + (-other)

    def __rsub__(self, other):
        return other + (-self)

    def __rmul__(self, other):
        return self * other

    def __truediv__(self, other):
        return self * other ** -1

    def __rtruediv__(self, other):
        return other * self ** -1

    def backward(self):
        topo = []
        visited = set()

        def build_topo(v):
            if v not in visited:
                visited.add(v)
                for child in v._children:
                    build_topo(child)
                topo.append(v)

        build_topo(self)
        self.grad = 1
        for v in reversed(topo):
            for child, local_grad in zip(v._children, v._local_grads):
                child.grad += local_grad * v.grad


def ensure_input() -> list[str]:
    if not INPUT_PATH.exists():
        urllib.request.urlretrieve(NAMES_URL, INPUT_PATH)
    docs = [line.strip() for line in INPUT_PATH.read_text().splitlines() if line.strip()]
    random.shuffle(docs)
    return docs


def matrix(nout, nin, std=0.08):
    return [[Value(random.gauss(0, std)) for _ in range(nin)] for _ in range(nout)]


def linear(x, w):
    return [sum(wi * xi for wi, xi in zip(wo, x)) for wo in w]


def softmax(logits):
    max_val = max(val.data for val in logits)
    exps = [(val - max_val).exp() for val in logits]
    total = sum(exps)
    return [e / total for e in exps]


def rmsnorm(x):
    ms = sum(xi * xi for xi in x) / len(x)
    scale = (ms + 1e-5) ** -0.5
    return [xi * scale for xi in x]


def train_model():
    docs = ensure_input()
    uchars = sorted(set("".join(docs)))
    bos = len(uchars)
    vocab = uchars + ["<BOS>"]
    vocab_size = len(vocab)

    n_layer = 1
    n_embd = 16
    block_size = 16
    n_head = 4
    head_dim = n_embd // n_head

    state_dict = {
        "wte": matrix(vocab_size, n_embd),
        "wpe": matrix(block_size, n_embd),
        "lm_head": matrix(vocab_size, n_embd),
    }
    for i in range(n_layer):
        state_dict[f"layer{i}.attn_wq"] = matrix(n_embd, n_embd)
        state_dict[f"layer{i}.attn_wk"] = matrix(n_embd, n_embd)
        state_dict[f"layer{i}.attn_wv"] = matrix(n_embd, n_embd)
        state_dict[f"layer{i}.attn_wo"] = matrix(n_embd, n_embd)
        state_dict[f"layer{i}.mlp_fc1"] = matrix(4 * n_embd, n_embd)
        state_dict[f"layer{i}.mlp_fc2"] = matrix(n_embd, 4 * n_embd)

    params = [p for mat in state_dict.values() for row in mat for p in row]

    def gpt(token_id, pos_id, keys, values):
        tok_emb = state_dict["wte"][token_id]
        pos_emb = state_dict["wpe"][pos_id]
        x = [t + p for t, p in zip(tok_emb, pos_emb)]
        x = rmsnorm(x)

        for li in range(n_layer):
            x_residual = x
            x = rmsnorm(x)
            q = linear(x, state_dict[f"layer{li}.attn_wq"])
            k = linear(x, state_dict[f"layer{li}.attn_wk"])
            v = linear(x, state_dict[f"layer{li}.attn_wv"])
            keys[li].append(k)
            values[li].append(v)
            x_attn = []
            for h in range(n_head):
                hs = h * head_dim
                q_h = q[hs : hs + head_dim]
                k_h = [ki[hs : hs + head_dim] for ki in keys[li]]
                v_h = [vi[hs : hs + head_dim] for vi in values[li]]
                attn_logits = [
                    sum(q_h[j] * k_h[t][j] for j in range(head_dim)) / head_dim**0.5
                    for t in range(len(k_h))
                ]
                attn_weights = softmax(attn_logits)
                head_out = [
                    sum(attn_weights[t] * v_h[t][j] for t in range(len(v_h)))
                    for j in range(head_dim)
                ]
                x_attn.extend(head_out)
            x = linear(x_attn, state_dict[f"layer{li}.attn_wo"])
            x = [a + b for a, b in zip(x, x_residual)]
            x_residual = x
            x = rmsnorm(x)
            x = linear(x, state_dict[f"layer{li}.mlp_fc1"])
            x = [xi.relu() for xi in x]
            x = linear(x, state_dict[f"layer{li}.mlp_fc2"])
            x = [a + b for a, b in zip(x, x_residual)]

        return linear(x, state_dict["lm_head"])

    learning_rate, beta1, beta2, eps_adam = 0.01, 0.85, 0.99, 1e-8
    m = [0.0] * len(params)
    v = [0.0] * len(params)
    num_steps = 1000
    loss_value = 0.0

    for step in range(num_steps):
        doc = docs[step % len(docs)]
        tokens = [bos] + [uchars.index(ch) for ch in doc] + [bos]
        n = min(block_size, len(tokens) - 1)
        keys, values = [[] for _ in range(n_layer)], [[] for _ in range(n_layer)]
        losses = []
        for pos_id in range(n):
            token_id, target_id = tokens[pos_id], tokens[pos_id + 1]
            logits = gpt(token_id, pos_id, keys, values)
            probs = softmax(logits)
            losses.append(-probs[target_id].log())
        loss = (1 / n) * sum(losses)
        loss.backward()
        lr_t = learning_rate * (1 - step / num_steps)
        for i, p in enumerate(params):
            m[i] = beta1 * m[i] + (1 - beta1) * p.grad
            v[i] = beta2 * v[i] + (1 - beta2) * p.grad**2
            m_hat = m[i] / (1 - beta1 ** (step + 1))
            v_hat = v[i] / (1 - beta2 ** (step + 1))
            p.data -= lr_t * m_hat / (v_hat**0.5 + eps_adam)
            p.grad = 0
        loss_value = loss.data

    config = {
        "vocabSize": vocab_size,
        "bosToken": bos,
        "nLayer": n_layer,
        "nEmbd": n_embd,
        "nHead": n_head,
        "headDim": head_dim,
        "blockSize": block_size,
    }

    weights = {}
    for name, rows in state_dict.items():
        row_count = len(rows)
        col_count = len(rows[0])
        data = [cell.data for row in rows for cell in row]
        weights[name] = {"rows": row_count, "cols": col_count, "data": data}

    bundle = {
        "config": config,
        "vocab": vocab,
        "weights": weights,
        "sampling": {"temperature": 0.5, "seed": 42},
        "training": {"steps": num_steps, "loss": loss_value, "docs": len(docs)},
    }
    return bundle


def vec_linear(x, matrix_dict):
    rows = matrix_dict["rows"]
    cols = matrix_dict["cols"]
    data = matrix_dict["data"]
    out = []
    for row in range(rows):
        base = row * cols
        total = 0.0
        for col in range(cols):
            total += data[base + col] * x[col]
        out.append(total)
    return out


def vec_rmsnorm(x):
    ms = sum(v * v for v in x) / len(x)
    scale = (ms + 1e-5) ** -0.5
    return [v * scale for v in x]


def vec_softmax(values):
    max_val = max(values)
    exps = [math.exp(v - max_val) for v in values]
    total = sum(exps)
    return [v / total for v in exps]


def sample_from_probs(probs, seed):
    state = seed & 0xFFFFFFFF

    def next_random():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1)
        t &= 0xFFFFFFFF
        t ^= t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    total = sum(probs)
    target = next_random() * total
    running = 0.0
    for index, weight in enumerate(probs):
        running += weight
        if target <= running:
            return index
    return len(probs) - 1


def make_reference_trace(bundle, prefix="em"):
    config = bundle["config"]
    vocab = bundle["vocab"]
    bos = config["bosToken"]
    n_head = config["nHead"]
    head_dim = config["headDim"]
    temperature = bundle["sampling"]["temperature"]

    char_to_id = {ch: idx for idx, ch in enumerate(vocab) if ch != "<BOS>"}
    prefix_ids = [char_to_id[ch] for ch in prefix]

    consumed = [bos] + prefix_ids[:-1]
    current_token = prefix_ids[-1]
    position_id = len(consumed)
    keys = [[]]
    values = [[]]

    def append_kv(token_id, pos_id):
        tok = bundle["weights"]["wte"]["data"][token_id * config["nEmbd"] : (token_id + 1) * config["nEmbd"]]
        pos = bundle["weights"]["wpe"]["data"][pos_id * config["nEmbd"] : (pos_id + 1) * config["nEmbd"]]
        x = vec_rmsnorm([a + b for a, b in zip(tok, pos)])
        x_norm = vec_rmsnorm(x)
        k = vec_linear(x_norm, bundle["weights"]["layer0.attn_wk"])
        v = vec_linear(x_norm, bundle["weights"]["layer0.attn_wv"])
        keys[0].append(k)
        values[0].append(v)

    for pos_id, token_id in enumerate(consumed):
        append_kv(token_id, pos_id)

    token_embedding = bundle["weights"]["wte"]["data"][
        current_token * config["nEmbd"] : (current_token + 1) * config["nEmbd"]
    ]
    position_embedding = bundle["weights"]["wpe"]["data"][
        position_id * config["nEmbd"] : (position_id + 1) * config["nEmbd"]
    ]
    x_after_embed = [a + b for a, b in zip(token_embedding, position_embedding)]
    x_after_norm = vec_rmsnorm(x_after_embed)
    x_residual = x_after_norm
    attn_input = vec_rmsnorm(x_after_norm)
    q = vec_linear(attn_input, bundle["weights"]["layer0.attn_wq"])
    k = vec_linear(attn_input, bundle["weights"]["layer0.attn_wk"])
    v = vec_linear(attn_input, bundle["weights"]["layer0.attn_wv"])
    all_keys = keys[0] + [k]
    all_values = values[0] + [v]

    heads = []
    attn_output = []
    for head in range(n_head):
        start = head * head_dim
        end = start + head_dim
        q_slice = q[start:end]
        k_slices = [row[start:end] for row in all_keys]
        v_slices = [row[start:end] for row in all_values]
        scores = [
            sum(q_slice[idx] * key_slice[idx] for idx in range(head_dim)) / math.sqrt(head_dim)
            for key_slice in k_slices
        ]
        weights = vec_softmax(scores)
        mixed = [
            sum(weights[t] * v_slices[t][idx] for t in range(len(v_slices)))
            for idx in range(head_dim)
        ]
        heads.append(
            {
                "q": q_slice,
                "kSlices": k_slices,
                "vSlices": v_slices,
                "scores": scores,
                "weights": weights,
                "mixedValue": mixed,
            }
        )
        attn_output.extend(mixed)

    projected = vec_linear(attn_output, bundle["weights"]["layer0.attn_wo"])
    x_after_attn = [a + b for a, b in zip(projected, x_residual)]
    mlp_input = vec_rmsnorm(x_after_attn)
    mlp_hidden = vec_linear(mlp_input, bundle["weights"]["layer0.mlp_fc1"])
    mlp_hidden_relu = [max(0.0, value) for value in mlp_hidden]
    mlp_output = vec_linear(mlp_hidden_relu, bundle["weights"]["layer0.mlp_fc2"])
    x_after_mlp = [a + b for a, b in zip(mlp_output, x_after_attn)]
    logits = vec_linear(x_after_mlp, bundle["weights"]["lm_head"])
    tempered_logits = [value / temperature for value in logits]
    probs = vec_softmax(tempered_logits)
    sampled_token_id = sample_from_probs(probs, bundle["sampling"]["seed"])

    ranked = sorted(enumerate(probs), key=lambda item: item[1], reverse=True)[:5]
    return {
        "prefix": prefix,
        "tokenId": current_token,
        "positionId": position_id,
        "tokenEmbedding": token_embedding,
        "positionEmbedding": position_embedding,
        "xAfterEmbed": x_after_embed,
        "xAfterNorm": x_after_norm,
        "heads": heads,
        "attnOutput": projected,
        "xAfterAttnResidual": x_after_attn,
        "mlpHidden": mlp_hidden_relu,
        "mlpOutput": mlp_output,
        "xAfterMlpResidual": x_after_mlp,
        "logits": logits,
        "probs": probs,
        "sampledTokenId": sampled_token_id,
        "topCandidates": [
            {
                "tokenId": token_id,
                "token": vocab[token_id],
                "probability": probability,
            }
            for token_id, probability in ranked
        ],
    }


def main():
    PUBLIC_ASSETS.mkdir(parents=True, exist_ok=True)
    TEST_FIXTURES.mkdir(parents=True, exist_ok=True)
    bundle = train_model()
    MODEL_PATH.write_text(json.dumps(bundle, separators=(",", ":")))
    TRACE_FIXTURE_PATH.write_text(
        json.dumps(make_reference_trace(bundle), separators=(",", ":"))
    )
    print(f"wrote {MODEL_PATH.relative_to(ROOT)}")
    print(f"wrote {TRACE_FIXTURE_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
