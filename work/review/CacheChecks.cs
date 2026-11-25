using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using PoptropicaDesktop;

internal static class CacheChecks
{
    private static void Require(bool value,string what)
    {
        if(!value) throw new Exception(what);
    }

    private static AssetEntry Entry(byte[] bytes) { return new AssetEntry(BundledAssets.HashBytes(bytes),bytes.Length); }

    private static async Task Run(string root,string shell)
    {
        Directory.CreateDirectory(root);
        var cache = new VerifiedAssetCache(5,2);
        var a = new byte[]{1,2};
        var b = new byte[]{3,4};
        var c = new byte[]{5,6,7};
        string file = Path.Combine(root,"fixture.swf");
        File.WriteAllBytes(file,a);
        var many = await Task.WhenAll(Enumerable.Range(0,32).Select(i=>cache.Read(file,Entry(a))));
        Require(many.All(x=>Object.ReferenceEquals(many[0],x)),"Concurrent read was duplicated");
        File.WriteAllBytes(file,b);
        Require((await cache.Read(file,Entry(b))).SequenceEqual(b),"New hash failed");
        Require((await cache.Read(file,Entry(a))).SequenceEqual(a),"Wrong content reused");
        File.WriteAllBytes(file,c);
        Require((await cache.Read(file,Entry(c))).SequenceEqual(c),"Added asset missing");
        Require((await cache.Read(file,Entry(b)))==null,"Evicted bytes were reused without validation");
        Require((await cache.Read(file,Entry(a))).SequenceEqual(a),"Recent asset was evicted");
        File.WriteAllBytes(file,new byte[]{3,5});
        Require((await cache.Read(file,Entry(b)))==null,"Wrong digest accepted");
        File.WriteAllBytes(file,b);
        Require((await cache.Read(file,Entry(b))).SequenceEqual(b),"Failed lookup poisoned a retry");
        byte[] large = new byte[12];
        File.WriteAllBytes(file,large);
        var first=await cache.Read(file,Entry(large));
        Require(!Object.ReferenceEquals(first,await cache.Read(file,Entry(large))),"Oversize retained");
        byte[] swf=File.ReadAllBytes(shell);
        var game=Entry(swf);
        var archive=new VerifiedAssetCache(24*1024*1024,1024);
        Require(await archive.Read(shell,game)!=null,"Shell failed verification");
        var timer=Stopwatch.StartNew();
        for(int i=0;i<15;i++)Require(BundledAssets.HashBytes(File.ReadAllBytes(shell))==game.Hash,"Bad baseline");
        long original=timer.ElapsedMilliseconds;
        timer.Restart();
        for(int i=0;i<15;i++)Require((await archive.Read(shell,game)).Length==swf.Length,"Bad reuse");
        Console.WriteLine("32 concurrent readers shared one verified buffer. LRU, size limit, corruption and retry passed. 15 warm Shell requests, uncached "+original+" ms, cached "+timer.Elapsed.TotalMilliseconds.ToString("0.00")+" ms.");
    }

    [STAThread] public static int Main(string[] args)
    {
        try
        {
            if(args.Length==3)
            {
                string qa=Path.GetFullPath(args[2]);
                Environment.SetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT",qa);
                string id=Guid.NewGuid().ToString("D");
                var updates=Path.Combine(qa,"Updates");
                var version=Path.Combine(updates,id);
                Directory.CreateDirectory(version);
                File.WriteAllText(Path.Combine(updates,"active.txt"),id);
                var contents=args[0]=="valid" ? new string('1',64)+"\t0\tscenes/mock.swf\n" : "broken";
                File.WriteAllText(Path.Combine(version,"catalog.tsv"),contents);
                if(args[0]=="valid")Require(BundledAssets.ActiveRoot==version && BundledAssets.Catalog.Count==1,"Valid update did not load");
                else Require(BundledAssets.ActiveRoot==null && BundledAssets.CatalogHash==BundledAssets.BaselineHash,"Broken update was activated");
                Console.WriteLine(args[0]+" manifest: snapshot and QA profile isolation passed");
            }
            else Run(args[0],args[1]).GetAwaiter().GetResult();
            return 0;
        }
        catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
