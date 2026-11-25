from pathlib import Path
import base64
import json
import struct

work=Path(__file__).resolve().parent
source=work.parent/"runtime/qa-profile/Default/Local Storage/leveldb/000003.log"
log=source.read_bytes()
offset=0
values={}
while offset+7<=len(log):
    size,kind=struct.unpack_from("<HB",log,offset+4)
    offset+=7
    assert kind==1
    row=log[offset:offset+size]
    offset+=size
    pos=12
    def field():
        global pos
        length=0
        shift=0
        while True:
            v=row[pos]
            pos+=1
            length|=(v&127)<<shift
            if v<128: break
            shift+=7
        data=row[pos:pos+length]
        pos+=length
        return data
    for _ in range(struct.unpack_from("<I",row,8)[0]):
        op=row[pos]
        pos+=1
        key=field()
        value=field() if op==1 else b""
        prefix=b"_http://127.0.0.1:51746\x00\x01127.0.0.1"
        if not key.startswith(prefix): continue
        name=key[len(prefix):].decode()
        if op==0:
            values.pop(name,None)
        elif value.startswith(b"\x01") and base64.b64decode(value[1:])[6:10]==b"TCSO":
            values[name]=value[1:].decode()
assert "//Char" in values and "//poptropica" in values
(work/"guest-adventure.json").write_text(json.dumps({"format":"poptropica-ruffle-save","version":1,"files":values}))
print("Reconstructed the saved local gameplay fixture",len(values),"Flash saves")
