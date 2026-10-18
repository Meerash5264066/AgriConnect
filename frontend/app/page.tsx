'use client';
import { useEffect } from 'react';

export default function Home(){
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const aiUrl = process.env.NEXT_PUBLIC_AI_URL;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (aiUrl) {
        (window as any).NEXT_PUBLIC_AI_URL = aiUrl;
        try { localStorage.setItem('agriconnect_ai_url', aiUrl); } catch(e){}
      }
      if (apiUrl) {
        (window as any).NEXT_PUBLIC_API_URL = apiUrl;
        try { localStorage.setItem('agriconnect_api_url', apiUrl); } catch(e){}
      }
    }
  }, []);

  return <main style={{width:'100vw',height:'100vh',margin:0,overflow:'hidden'}}>
    <iframe title="AgriConnect UI" src="/agriconnect-ui.html"
      style={{width:'100%',height:'100%',border:0,display:'block'}} />
  </main>;
}