import { TransactionDetail } from '@/components/transaction-detail';
export default async function Page({params}:{params:Promise<{transactionId:string}>}){const {transactionId}=await params;return <TransactionDetail transactionId={transactionId}/>;}
