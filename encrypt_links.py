#!/usr/bin/env python3
import json
import os
import base64
import hashlib
import hmac

PASSWORD = "X9f2-K7wQ-M5pZ-V2tRt-XyZ99"
ITERATIONS = 2000

sbox = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]

inv_sbox = [0] * 256
for i in range(256):
    inv_sbox[sbox[i]] = i

rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]

def xor_bytes(a, b):
    return bytes(i ^ j for i, j in zip(a, b))

def sub_word(word):
    return bytes(sbox[b] for b in word)

def rot_word(word):
    return word[1:] + word[:1]

def key_expansion(key):
    key_len = len(key)
    nk = key_len // 4
    nr = nk + 6
    total_words = 4 * (nr + 1)
    w = []
    for i in range(nk):
        w.append(key[4*i:4*i+4])
    for i in range(nk, total_words):
        temp = w[i-1]
        if i % nk == 0:
            temp = xor_bytes(sub_word(rot_word(temp)), bytes([rcon[i//nk - 1], 0, 0, 0]))
        elif nk > 6 and i % nk == 4:
            temp = sub_word(temp)
        w.append(xor_bytes(w[i-nk], temp))
    return [bytearray(block) for block in w]

def add_round_key(state, round_key):
    for i in range(4):
        for j in range(4):
            state[j][i] ^= round_key[i][j]

def sub_bytes(state):
    for i in range(4):
        for j in range(4):
            state[i][j] = sbox[state[i][j]]

def inv_sub_bytes(state):
    for i in range(4):
        for j in range(4):
            state[i][j] = inv_sbox[state[i][j]]

def shift_rows(state):
    state[1][0], state[1][1], state[1][2], state[1][3] = state[1][1], state[1][2], state[1][3], state[1][0]
    state[2][0], state[2][1], state[2][2], state[2][3] = state[2][2], state[2][3], state[2][0], state[2][1]
    state[3][0], state[3][1], state[3][2], state[3][3] = state[3][3], state[3][0], state[3][1], state[3][2]

def inv_shift_rows(state):
    state[1][0], state[1][1], state[1][2], state[1][3] = state[1][3], state[1][0], state[1][1], state[1][2]
    state[2][0], state[2][1], state[2][2], state[2][3] = state[2][2], state[2][3], state[2][0], state[2][1]
    state[3][0], state[3][1], state[3][2], state[3][3] = state[3][1], state[3][2], state[3][3], state[3][0]

def xtime(a):
    result = (a << 1) & 0xff
    if a & 0x80:
        result ^= 0x1b
    return result

def mix_columns(state):
    for i in range(4):
        a = [state[j][i] for j in range(4)]
        state[0][i] = xtime(a[0]) ^ (xtime(a[1]) ^ a[1]) ^ a[2] ^ a[3]
        state[1][i] = a[0] ^ xtime(a[1]) ^ (xtime(a[2]) ^ a[2]) ^ a[3]
        state[2][i] = a[0] ^ a[1] ^ xtime(a[2]) ^ (xtime(a[3]) ^ a[3])
        state[3][i] = (xtime(a[0]) ^ a[0]) ^ a[1] ^ a[2] ^ xtime(a[3])

def inv_mix_columns(state):
    for i in range(4):
        a = [state[j][i] for j in range(4)]
        state[0][i] = mul(14, a[0]) ^ mul(11, a[1]) ^ mul(13, a[2]) ^ mul(9, a[3])
        state[1][i] = mul(9, a[0]) ^ mul(14, a[1]) ^ mul(11, a[2]) ^ mul(13, a[3])
        state[2][i] = mul(13, a[0]) ^ mul(9, a[1]) ^ mul(14, a[2]) ^ mul(11, a[3])
        state[3][i] = mul(11, a[0]) ^ mul(13, a[1]) ^ mul(9, a[2]) ^ mul(14, a[3])

def mul(a, b):
    p = 0
    for _ in range(8):
        if b & 1:
            p ^= a
        hi = a & 0x80
        a = (a << 1) & 0xff
        if hi:
            a ^= 0x1b
        b >>= 1
    return p

def bytes_to_state(block):
    state = [[0]*4 for _ in range(4)]
    for i in range(4):
        for j in range(4):
            state[j][i] = block[i*4 + j]
    return state

def state_to_bytes(state):
    block = bytearray(16)
    for i in range(4):
        for j in range(4):
            block[i*4 + j] = state[j][i]
    return bytes(block)

def aes_encrypt_block(plaintext, round_keys):
    state = bytes_to_state(plaintext)
    add_round_key(state, round_keys[0:4])
    for rnd in range(1, 14):
        sub_bytes(state)
        shift_rows(state)
        mix_columns(state)
        add_round_key(state, round_keys[rnd*4:(rnd+1)*4])
    sub_bytes(state)
    shift_rows(state)
    add_round_key(state, round_keys[56:60])
    return state_to_bytes(state)

def aes_decrypt_block(ciphertext, round_keys):
    state = bytes_to_state(ciphertext)
    add_round_key(state, round_keys[56:60])
    for rnd in range(13, 0, -1):
        inv_shift_rows(state)
        inv_sub_bytes(state)
        add_round_key(state, round_keys[rnd*4:(rnd+1)*4])
        inv_mix_columns(state)
    inv_shift_rows(state)
    inv_sub_bytes(state)
    add_round_key(state, round_keys[0:4])
    return state_to_bytes(state)

def pkcs7_pad(data):
    pad_len = 16 - (len(data) % 16)
    return data + bytes([pad_len] * pad_len)

def pkcs7_unpad(data):
    pad_len = data[-1]
    return data[:-pad_len]

def aes_cbc_encrypt(plaintext, key, iv):
    padded = pkcs7_pad(plaintext)
    round_keys = key_expansion(key)
    prev = iv
    result = bytearray()
    for i in range(0, len(padded), 16):
        block = padded[i:i+16]
        xored = xor_bytes(block, prev)
        encrypted = aes_encrypt_block(xored, round_keys)
        result.extend(encrypted)
        prev = encrypted
    return bytes(result)

def aes_cbc_decrypt(ciphertext, key, iv):
    round_keys = key_expansion(key)
    prev = iv
    result = bytearray()
    for i in range(0, len(ciphertext), 16):
        block = ciphertext[i:i+16]
        decrypted = aes_decrypt_block(block, round_keys)
        xored = xor_bytes(decrypted, prev)
        result.extend(xored)
        prev = block
    return pkcs7_unpad(bytes(result))

def derive_key(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, ITERATIONS, dklen=32)

def encrypt_enlace(enlace, password):
    salt = os.urandom(16)
    iv = os.urandom(16)
    key = derive_key(password, salt)
    ciphertext = aes_cbc_encrypt(enlace.encode('utf-8'), key, iv)
    payload = salt + iv + ciphertext
    return base64.b64encode(payload).decode('ascii')

def decrypt_enlace(encrypted_b64, password):
    payload = base64.b64decode(encrypted_b64)
    salt = payload[:16]
    iv = payload[16:32]
    ciphertext = payload[32:]
    key = derive_key(password, salt)
    plaintext = aes_cbc_decrypt(ciphertext, key, iv)
    return plaintext.decode('utf-8')

def main():
    with open('data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    for category in data:
        for item in data[category]:
            if 'enlace' in item and item['enlace'] and item['enlace'] != '#':
                item['enlace'] = encrypt_enlace(item['enlace'], PASSWORD)

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("Todos los enlaces han sido cifrados correctamente.")

if __name__ == '__main__':
    main()
