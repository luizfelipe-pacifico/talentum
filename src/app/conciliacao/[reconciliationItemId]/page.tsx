import { ReconciliationDetail } from '@/components/reconciliation';
export default async function Page({params}:{params:Promise<{reconciliationItemId:string}>}){const {reconciliationItemId}=await params;return <ReconciliationDetail itemId={reconciliationItemId}/>}
