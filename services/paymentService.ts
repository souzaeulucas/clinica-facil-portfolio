import { supabase } from '../services/supabase';

export const rebalancePayments = async (planId: string, pricePerSession: number) => {
    try {
        // 1. Get total amount of all payments for this plan
        const { data: payments, error: payError } = await supabase
            .from('therapy_payments')
            .select('id, amount')
            .eq('plan_id', planId)
            .order('payment_date', { ascending: true });

        if (payError) throw payError;
        const totalFunds = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

        // 2. Get all eligible appointments for this plan (attended OR scheduled but not missed)
        const { data: eligibleAptsRaw, error: aptsError } = await supabase
            .from('appointments')
            .select('id, date, attendance_status, status, type')
            .eq('treatment_plan_id', planId)
            .in('type', ['Sessão', 'Avaliação', 'Primeira Consulta', 'Retorno'])
            .neq('status', 'cancelled')
            .order('date', { ascending: true });

        if (aptsError) throw aptsError;

        // Filter: only charge for 'attended', or pre-charge for 'scheduled' if it's not missed/justified
        const eligibleApts = eligibleAptsRaw?.filter(apt =>
            apt.attendance_status === 'attended' ||
            (!['missed', 'justified', 'cancelled'].includes(apt.attendance_status || '') && apt.status === 'scheduled')
        ) || [];

        const aptIds = eligibleApts.map(a => a.id) || [];
        if (aptIds.length > 0) {
            // Delete ALL existing allocations for these appointments to reset
            await supabase.from('payment_allocations').delete().in('appointment_id', aptIds);
            // Reset is_paid for these appointments
            await supabase.from('appointments').update({ is_paid: false }).in('id', aptIds);
        }

        if (totalFunds <= 0 || !eligibleApts || eligibleApts.length === 0) {
            return { success: true, balance: totalFunds };
        }

        let remainingBudget = totalFunds;
        const newAllocations = [];
        const appointmentsToMarkPaid = [];

        let paymentIdx = 0;
        let currentPayRemaining = Number(payments[paymentIdx]?.amount || 0);

        for (const apt of eligibleApts) {
            if (remainingBudget <= 0.01) {
                // If it's an evaluation, it's free even with no budget
                if (apt.type === 'Avaliação') {
                    appointmentsToMarkPaid.push(apt.id);
                }
                if (remainingBudget <= 0) continue;
            }

            let aptCostRemaining = apt.type === 'Avaliação' ? 0 : pricePerSession;
            while (aptCostRemaining > 0 && paymentIdx < payments.length) {
                const allocationFromThisPayment = Math.min(currentPayRemaining, aptCostRemaining);
                if (allocationFromThisPayment > 0) {
                    newAllocations.push({
                        payment_id: payments[paymentIdx].id,
                        appointment_id: apt.id,
                        amount: allocationFromThisPayment
                    });
                    currentPayRemaining -= allocationFromThisPayment;
                    aptCostRemaining -= allocationFromThisPayment;
                    remainingBudget -= allocationFromThisPayment;
                }
                if (currentPayRemaining <= 0) {
                    paymentIdx++;
                    currentPayRemaining = Number(payments[paymentIdx]?.amount || 0);
                }
            }
            if (aptCostRemaining <= 0) {
                appointmentsToMarkPaid.push(apt.id);
            }
        }

        if (newAllocations.length > 0) {
            await supabase.from('payment_allocations').insert(newAllocations);
        }

        if (appointmentsToMarkPaid.length > 0) {
            await supabase.from('appointments').update({ is_paid: true }).in('id', appointmentsToMarkPaid);
        }

        return { success: true, balance: remainingBudget };
    } catch (error: any) {
        console.error('Error rebalancing payments:', error);
        throw error;
    }
};
