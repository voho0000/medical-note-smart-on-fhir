"use client"

import { useState, FormEvent } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useFhirContext } from "@/src/application/hooks/chat/use-fhir-context.hook"

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const { t } = useLanguage()
  const { patientId, fhirServerUrl } = useFhirContext()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [formData, setFormData] = useState({
    email: "",
    issueType: "",
    severity: "medium",
    description: "",
    steps: "",
  })

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.email) {
      newErrors.email = t.feedback?.emailRequired || "請輸入電子郵件"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t.feedback?.emailInvalid || "請輸入有效的電子郵件地址"
    }

    if (!formData.issueType) {
      newErrors.issueType = t.feedback?.issueTypeRequired || "請選擇問題類型"
    }

    if (!formData.description) {
      newErrors.description = t.feedback?.descriptionRequired || "請輸入問題描述"
    } else if (formData.description.length < 20) {
      newErrors.description = t.feedback?.descriptionTooShort || "問題描述至少需要 20 個字元"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setSubmitStatus("idle")

    try {
      const systemInfo = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        language: navigator.language,
        currentPath: window.location.pathname,
        fhirServerUrl: fhirServerUrl || "未連線",
        patientId: patientId || "無",
      }

      const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL || "/api/feedback"
      const clientKey = process.env.NEXT_PUBLIC_PROXY_KEY || ""
      
      const response = await fetch(feedbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientKey && { "X-Client-Key": clientKey }),
        },
        body: JSON.stringify({
          ...formData,
          systemInfo,
        }),
      })

      if (!response.ok) {
        throw new Error("發送失敗")
      }

      setSubmitStatus("success")
      setFormData({
        email: "",
        issueType: "",
        severity: "medium",
        description: "",
        steps: "",
      })
      setErrors({})
      
      setTimeout(() => {
        onOpenChange(false)
        setSubmitStatus("idle")
      }, 2000)
    } catch (error) {
      console.error("Feedback submission error:", error)
      setSubmitStatus("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.feedback?.title || "問題回報"}</DialogTitle>
          <DialogDescription>
            {t.feedback?.description || "請描述您遇到的問題，我們會盡快處理。"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t.feedback?.email || "您的電子郵件"} *</Label>
            <Input
              id="email"
              type="email"
              placeholder="your.email@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {t.feedback?.emailDescription || "用於聯繫和追蹤問題處理進度"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="issueType">{t.feedback?.issueType || "問題類型"} *</Label>
              <Select
                value={formData.issueType}
                onValueChange={(value) => setFormData({ ...formData, issueType: value })}
              >
                <SelectTrigger className={errors.issueType ? "border-red-500" : ""}>
                  <SelectValue placeholder={t.feedback?.selectIssueType || "選擇類型"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">{t.feedback?.types?.bug || "功能錯誤"}</SelectItem>
                  <SelectItem value="ui">{t.feedback?.types?.ui || "UI/UX 問題"}</SelectItem>
                  <SelectItem value="performance">{t.feedback?.types?.performance || "效能問題"}</SelectItem>
                  <SelectItem value="feature">{t.feedback?.types?.feature || "功能建議"}</SelectItem>
                  <SelectItem value="other">{t.feedback?.types?.other || "其他"}</SelectItem>
                </SelectContent>
              </Select>
              {errors.issueType && (
                <p className="text-sm text-red-500">{errors.issueType}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">{t.feedback?.severity || "嚴重程度"} *</Label>
              <Select
                value={formData.severity}
                onValueChange={(value) => setFormData({ ...formData, severity: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t.feedback?.severityLevels?.low || "低"}</SelectItem>
                  <SelectItem value="medium">{t.feedback?.severityLevels?.medium || "中"}</SelectItem>
                  <SelectItem value="high">{t.feedback?.severityLevels?.high || "高"}</SelectItem>
                  <SelectItem value="critical">{t.feedback?.severityLevels?.critical || "緊急"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t.feedback?.descriptionLabel || "問題描述"} *</Label>
            <Textarea
              id="description"
              placeholder={t.feedback?.descriptionPlaceholder || "請詳細描述您遇到的問題..."}
              className={`min-h-[100px] ${errors.description ? "border-red-500" : ""}`}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {t.feedback?.descriptionHint || "至少 20 個字元"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="steps">{t.feedback?.stepsToReproduce || "重現步驟"}</Label>
            <Textarea
              id="steps"
              placeholder={t.feedback?.stepsPlaceholder || "1. 點擊...\n2. 輸入...\n3. 發生..."}
              className="min-h-[80px]"
              value={formData.steps}
              onChange={(e) => setFormData({ ...formData, steps: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              {t.feedback?.stepsHint || "選填，幫助我們重現問題"}
            </p>
          </div>

          {submitStatus === "success" && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {t.feedback?.successMessage || "問題回報已成功送出！感謝您的回饋。"}
              </AlertDescription>
            </Alert>
          )}

          {submitStatus === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t.feedback?.errorMessage || "發送失敗，請稍後再試。"}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.common.sending}
                </>
              ) : (
                t.common.send
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
