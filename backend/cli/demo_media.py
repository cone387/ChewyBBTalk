"""Small, deterministic offline fixtures; no downloads or runtime media tools."""

import io
import math
import struct
import wave
import zlib
from pathlib import Path
from zipfile import ZipFile


def png(width, height, variant, transparent=False):
    def chunk(kind, data):
        return (
            struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
        )

    colors = [
        bytes(
            (
                40 + tile * 45,
                70 + variant * 15,
                200 - tile * 30,
                80 if transparent and tile % 2 else 255,
            )
        )
        for tile in range(4)
    ]
    patterns = [
        b'\0'
        + b''.join(colors[(x + y + variant) % 4] * 48 for x in range((width + 47) // 48))[
            : width * 4
        ]
        for y in range(4)
    ]
    rows = b''.join(patterns[y // 48 % 4] for y in range(height))
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(rows))
        + chunk(b'IEND', b'')
    )


def pdf():
    stream = b'BT /F1 20 Tf 50 760 Td (BBTalk demo document) Tj 0 -40 Td (Offline preview and download sample.) Tj ET'
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
    ]
    output, offsets = bytearray(b'%PDF-1.4\n'), [0]
    for index, value in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f'{index} 0 obj\n'.encode() + value + b'\nendobj\n')
    start = len(output)
    output.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:
        output.extend(f'{offset:010} 00000 n \n'.encode())
    output.extend(
        f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode()
    )
    return bytes(output)


def assets():
    result = {}
    dimensions = [
        (640, 360),
        (240, 600),
        (360, 360),
        (900, 180),
        (360, 360),
        (480, 320),
        (320, 480),
        (500, 300),
        (300, 500),
    ]
    for index, (width, height) in enumerate(dimensions):
        result[f'image{index}'] = (
            f'演示图片-{index + 1}.png',
            'image/png',
            png(width, height, index, transparent=index == 4),
        )
    audio = io.BytesIO()
    with wave.open(audio, 'wb') as output:
        output.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        output.writeframes(
            b''.join(
                struct.pack('<h', int(3000 * math.sin(2 * math.pi * 440 * i / 16000)))
                for i in range(16000)
            )
        )
    result['audio'] = ('提示音-1秒.wav', 'audio/wav', audio.getvalue())
    result['video'] = (
        '动态图案-2秒.mp4',
        'video/mp4',
        (Path(__file__).parent / 'demo_assets/sample.mp4').read_bytes(),
    )
    result['pdf'] = ('演示说明.pdf', 'application/pdf', pdf())
    result['text'] = (
        '一份带空格的中文说明 & notes.txt',
        'text/plain',
        '演示附件\n支持中文、换行与下载。\n'.encode(),
    )
    result['csv'] = (
        '每周记录统计.csv',
        'text/csv',
        '\ufeff日期,标签,数量\n2026-01-01,日常,3\n2026-01-02,技术,5\n'.encode(),
    )
    result['json'] = ('示例配置.json', 'application/json', b'{"demo": true, "items": [1, 2, 3]}\n')
    archive = io.BytesIO()
    with ZipFile(archive, 'w') as output:
        output.writestr('readme.txt', 'BBTalk demo archive\n')
    result['zip'] = ('示例资料包.zip', 'application/zip', archive.getvalue())
    return result
