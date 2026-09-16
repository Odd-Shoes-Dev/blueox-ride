import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import type { ChurchCommissionSummary } from '@/types'
import {
  ArrowLeft,
  Building2,
  Download,
  Check,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface CommissionWithDetails {
  id: string
  church_id: string
  booking_id: string
  ride_price: number
  booking_fee: number
  commission_amount: number
  status: 'pending' | 'paid'
  paid_at: string | null
  paid_by: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
  booking: {
    id: string
    created_at: string
    ride: {
      origin_name: string
      destination_name: string
      departure_time: string
    }
    passenger: {
      full_name: string
    }
  }
}

export default function AdminChurchPayoutsPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [churches, setChurches] = useState<ChurchCommissionSummary[]>([])
  const [selectedChurch, setSelectedChurch] = useState<ChurchCommissionSummary | null>(null)
  const [commissions, setCommissions] = useState<CommissionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCommissions, setLoadingCommissions] = useState(false)
  const [showPayoutDialog, setShowPayoutDialog] = useState(false)
  const [payoutReference, setPayoutReference] = useState('')
  const [payoutNotes, setPayoutNotes] = useState('')
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([])
  const [processingPayout, setProcessingPayout] = useState(false)
  const [expandedChurch, setExpandedChurch] = useState<string | null>(null)

  // Check if user is admin
  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      toast({
        title: 'Access denied',
        description: 'You do not have permission to view this page.',
        variant: 'destructive',
      })
      navigate('/')
    }
  }, [profile, navigate, toast])

  // Fetch church commission summaries
  useEffect(() => {
    fetchChurches()
  }, [])

  const fetchChurches = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('church_commission_summary')
      .select('*')
      .order('total_pending', { ascending: false })

    if (error) {
      console.error('Error fetching churches:', error)
      toast({
        title: 'Error',
        description: 'Failed to load church data.',
        variant: 'destructive',
      })
    } else {
      setChurches(data as ChurchCommissionSummary[])
    }
    setLoading(false)
  }

  const fetchCommissions = async (churchId: string) => {
    setLoadingCommissions(true)
    const { data, error } = await supabase
      .from('church_commissions')
      .select(`
        *,
        booking:bookings(
          id,
          created_at,
          ride:rides(origin_name, destination_name, departure_time),
          passenger:users(full_name)
        )
      `)
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching commissions:', error)
    } else {
      setCommissions(data as CommissionWithDetails[])
    }
    setLoadingCommissions(false)
  }

  const toggleChurchExpand = (church: ChurchCommissionSummary) => {
    if (expandedChurch === church.id) {
      setExpandedChurch(null)
      setSelectedChurch(null)
      setCommissions([])
    } else {
      setExpandedChurch(church.id)
      setSelectedChurch(church)
      fetchCommissions(church.id)
    }
  }

  const toggleCommissionSelect = (commissionId: string) => {
    setSelectedCommissions(prev =>
      prev.includes(commissionId)
        ? prev.filter(id => id !== commissionId)
        : [...prev, commissionId]
    )
  }

  const selectAllPending = () => {
    const pendingIds = commissions
      .filter(c => c.status === 'pending')
      .map(c => c.id)
    setSelectedCommissions(pendingIds)
  }

  const handleMarkAsPaid = async () => {
    if (selectedCommissions.length === 0) return

    setProcessingPayout(true)

    try {
      // Mark each selected commission as paid
      for (const commissionId of selectedCommissions) {
        const { error } = await supabase.rpc('mark_commission_paid', {
          p_commission_id: commissionId,
          p_admin_id: user?.id,
          p_payment_reference: payoutReference || null,
          p_notes: payoutNotes || null,
        })

        if (error) {
          console.error('Error marking commission as paid:', error)
          throw error
        }
      }

      toast({
        title: 'Payout recorded',
        description: `${selectedCommissions.length} commission(s) marked as paid.`,
        variant: 'success',
      })

      // Refresh data
      await fetchChurches()
      if (selectedChurch) {
        await fetchCommissions(selectedChurch.id)
      }

      setSelectedCommissions([])
      setShowPayoutDialog(false)
      setPayoutReference('')
      setPayoutNotes('')
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to process payout. Please try again.',
        variant: 'destructive',
      })
    }

    setProcessingPayout(false)
  }

  const exportToCSV = () => {
    if (!selectedChurch || commissions.length === 0) return

    const headers = ['Date', 'Booking ID', 'Route', 'Passenger', 'Ride Price', 'Commission', 'Status', 'Paid At']
    const rows = commissions.map(c => [
      new Date(c.created_at).toLocaleDateString(),
      c.booking_id,
      `${c.booking?.ride?.origin_name} → ${c.booking?.ride?.destination_name}`,
      c.booking?.passenger?.full_name || 'Unknown',
      c.ride_price,
      c.commission_amount,
      c.status,
      c.paid_at ? new Date(c.paid_at).toLocaleDateString() : '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedChurch.slug}-commissions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPending = churches.reduce((sum, c) => sum + c.total_pending, 0)
  const selectedTotal = commissions
    .filter(c => selectedCommissions.includes(c.id))
    .reduce((sum, c) => sum + c.commission_amount, 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-navy-900 pt-12 pb-6 px-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-white/80 hover:text-white mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-white">Church Commission Payouts</h1>
          <p className="text-white/70 text-sm mt-1">
            Manage commission payments to partner churches
          </p>
        </div>
      </div>

      <div className="px-4 mt-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Churches</p>
                <p className="text-2xl font-bold">{churches.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Pending</p>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalPending)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Earned (All Time)</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(churches.reduce((sum, c) => sum + c.total_earned, 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Paid Out</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(churches.reduce((sum, c) => sum + c.total_paid, 0))}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Refresh Button */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={fetchChurches}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Churches List */}
          <div className="space-y-4">
            {churches.map(church => (
              <Card key={church.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => toggleChurchExpand(church)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-coral-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-coral-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{church.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">/{church.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Pending</p>
                        <p className="font-semibold text-amber-600">
                          {formatCurrency(church.total_pending)}
                        </p>
                      </div>
                      {expandedChurch === church.id ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {expandedChurch === church.id && (
                  <CardContent className="border-t">
                    {/* Church Stats */}
                    <div className="grid grid-cols-3 gap-4 py-4 border-b">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Bookings</p>
                        <p className="font-semibold">{church.total_bookings}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Earned</p>
                        <p className="font-semibold">{formatCurrency(church.total_earned)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Paid</p>
                        <p className="font-semibold text-green-600">{formatCurrency(church.total_paid)}</p>
                      </div>
                    </div>

                    {/* Payout Info */}
                    {(church.mobile_money_number || church.contact_email) && (
                      <div className="py-4 border-b">
                        <p className="text-sm font-medium mb-2">Payout Details</p>
                        {church.mobile_money_number && (
                          <p className="text-sm text-muted-foreground">
                            Mobile Money: {church.mobile_money_number}
                            {church.mobile_money_name && ` (${church.mobile_money_name})`}
                          </p>
                        )}
                        {church.contact_email && (
                          <p className="text-sm text-muted-foreground">
                            Email: {church.contact_email}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between py-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={selectAllPending}
                          disabled={commissions.filter(c => c.status === 'pending').length === 0}
                        >
                          Select All Pending
                        </Button>
                        {selectedCommissions.length > 0 && (
                          <Button
                            size="sm"
                            onClick={() => setShowPayoutDialog(true)}
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Mark {selectedCommissions.length} as Paid
                          </Button>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportToCSV}
                        disabled={commissions.length === 0}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                      </Button>
                    </div>

                    {/* Commissions Table */}
                    {loadingCommissions ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    ) : commissions.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No commissions recorded yet
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10"></TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Route</TableHead>
                              <TableHead>Passenger</TableHead>
                              <TableHead className="text-right">Commission</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {commissions.map(commission => (
                              <TableRow key={commission.id}>
                                <TableCell>
                                  {commission.status === 'pending' && (
                                    <input
                                      type="checkbox"
                                      checked={selectedCommissions.includes(commission.id)}
                                      onChange={() => toggleCommissionSelect(commission.id)}
                                      className="w-4 h-4"
                                    />
                                  )}
                                </TableCell>
                                <TableCell>
                                  {new Date(commission.created_at).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {commission.booking?.ride?.origin_name} →{' '}
                                  {commission.booking?.ride?.destination_name}
                                </TableCell>
                                <TableCell>
                                  {commission.booking?.passenger?.full_name || 'Unknown'}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(commission.commission_amount)}
                                </TableCell>
                                <TableCell>
                                  {commission.status === 'paid' ? (
                                    <span className="inline-flex items-center gap-1 text-green-600">
                                      <Check className="w-4 h-4" />
                                      Paid
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-600">
                                      <Clock className="w-4 h-4" />
                                      Pending
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>

          {churches.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No church data available</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Payout Dialog */}
      <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payout</DialogTitle>
            <DialogDescription>
              Mark {selectedCommissions.length} commission(s) as paid.
              Total: {formatCurrency(selectedTotal)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reference">Payment Reference (optional)</Label>
              <Input
                id="reference"
                placeholder="e.g., MM-123456789"
                value={payoutReference}
                onChange={e => setPayoutReference(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="Any additional notes..."
                value={payoutNotes}
                onChange={e => setPayoutNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayoutDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkAsPaid} disabled={processingPayout}>
              {processingPayout ? 'Processing...' : 'Confirm Payout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
