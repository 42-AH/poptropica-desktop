using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;

namespace PoptropicaDesktop
{
    internal sealed class VerifiedAssetCache
    {
        private sealed class Entry
        {
            internal string Hash;
            internal byte[] Bytes;
        }

        private readonly object gate = new object();
        private readonly Dictionary<string,LinkedListNode<Entry>> loaded = new Dictionary<string,LinkedListNode<Entry>>();
        private readonly Dictionary<string,Task<byte[]>> pending = new Dictionary<string,Task<byte[]>>();
        private readonly LinkedList<Entry> recent = new LinkedList<Entry>();
        private readonly int byteLimit;
        private readonly int entryLimit;
        private long size;

        internal VerifiedAssetCache(int byteLimit, int entryLimit)
        {
            this.byteLimit = byteLimit;
            this.entryLimit = entryLimit;
        }

        internal Task<byte[]> Read(string file, AssetEntry asset)
        {
            lock (gate)
            {
                LinkedListNode<Entry> found;
                if (loaded.TryGetValue(asset.Hash,out found))
                {
                    recent.Remove(found);
                    recent.AddFirst(found);
                    return Task.FromResult(found.Value.Bytes.LongLength == asset.Size ? found.Value.Bytes : null);
                }
                Task<byte[]> loading;
                if (pending.TryGetValue(asset.Hash,out loading)) return loading;
                loading = Task.Run(() => Load(file,asset));
                pending.Add(asset.Hash,loading);
                return loading;
            }
        }

        private byte[] Load(string file, AssetEntry asset)
        {
            try
            {
                byte[] bytes;
                using (var input = File.OpenRead(file))
                {
                    if (input.Length != asset.Size) return null;
                    using (var reader = new BinaryReader(input)) bytes = reader.ReadBytes(checked((int)asset.Size));
                }
                if (bytes.LongLength != asset.Size || BundledAssets.HashBytes(bytes) != asset.Hash) return null;
                if (bytes.Length <= byteLimit)
                {
                    lock (gate)
                    {
                        while (recent.Count > 0 && (size + bytes.Length > byteLimit || recent.Count >= entryLimit))
                        {
                            var oldest = recent.Last.Value;
                            recent.RemoveLast();
                            loaded.Remove(oldest.Hash);
                            size -= oldest.Bytes.Length;
                        }
                        var entry = new Entry {Hash=asset.Hash,Bytes=bytes};
                        loaded.Add(asset.Hash,recent.AddFirst(entry));
                        size += bytes.Length;
                    }
                }
                return bytes;
            }
            finally { lock (gate) pending.Remove(asset.Hash); }
        }
    }
}
