using System;
using PoptropicaDesktop;
class RangeCheck
{
    static void Check(string value,int size,bool valid,int first=0,int last=0)
    {
        int a,b;
        if(BundledAssets.ReadRange(value,size,out a,out b)!=valid || valid && (a!=first || b!=last))throw new Exception(value);
    }
    static void Main()
    {
        Check("bytes=0-0",6,true,0,0);
        Check("bytes=2-9999999999",6,true,2,5);
        Check("bytes=1-",6,true,1,5);
        Check("bytes=-2",6,true,4,5);
        Check("bytes=-200",6,true,0,5);
        Check("bytes=2-1",6,false);
        Check("bytes=-0",6,false);
        Check("bytes=0-",0,false);
        Check("bytes=6-",6,false);
        Check("bytes=2-3,5-6",6,false);
        Console.WriteLine("10 range cases passed");
    }
}
namespace PoptropicaDesktop { internal static class EmbeddedGame { internal static string InstallFolder { get { return System.AppDomain.CurrentDomain.BaseDirectory; } } } }
