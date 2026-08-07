import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WeeklyDashboardV2Repository } from './weekly-dashboard-v2.repository';
import { SaveWeeklyReportV2Dto } from './dto/save-weekly-report.dto';
import { OrganizationV2Service } from '../organization/organization-v2.service';

@Injectable()
export class WeeklyDashboardV2Service {
  constructor(
    private readonly repository: WeeklyDashboardV2Repository,
    private readonly organizationService: OrganizationV2Service,
  ) {}

  async findReports(teamId: string) {
    if (!await this.repository.teamExists(teamId)) {
      throw new NotFoundException('Team not found');
    }
    return this.repository.findReports(teamId);
  }

  async findReport(teamId: string, reportId: string) {
    const report = await this.repository.findReport(teamId, reportId);
    if (!report) throw new NotFoundException('Weekly report not found');
    return report;
  }

  async findContext(teamId: string, requestedWeekStart?: string) {
    const weekStart = requestedWeekStart ?? new Date().toISOString().slice(0, 10);
    const weekEndDate = new Date(`${weekStart}T00:00:00.000Z`);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    const [organization, sprints] = await Promise.all([
      this.organizationService.findTeamOrganization(teamId),
      this.repository.findSprintsForWeek(teamId, weekStart, weekEnd),
    ]);
    const assignments = organization.assignments.filter((assignment) =>
      assignment.startedAt <= weekEnd && (!assignment.endedAt || assignment.endedAt >= weekStart),
    );
    return {
      team: organization.team,
      weekStart,
      weekEnd,
      assignments,
      sprints,
    };
  }

  async saveReport(teamId: string, input: SaveWeeklyReportV2Dto) {
    if (!await this.repository.teamExists(teamId)) {
      throw new NotFoundException('Team not found');
    }
    if (new Date(input.weekEnd).getTime() < new Date(input.weekStart).getTime()) {
      throw new BadRequestException('weekEnd cannot be earlier than weekStart');
    }
    for (const initiative of input.initiatives) {
      const start = new Date(initiative.startDate).getTime();
      if (initiative.plannedEndDate && new Date(initiative.plannedEndDate).getTime() < start) {
        throw new BadRequestException(`Initiative "${initiative.name}" has an invalid plannedEndDate`);
      }
      if (initiative.actualEndDate && new Date(initiative.actualEndDate).getTime() < start) {
        throw new BadRequestException(`Initiative "${initiative.name}" has an invalid actualEndDate`);
      }
    }
    const reportId = await this.repository.saveReport({ teamId, ...input });
    const report = await this.repository.findReport(teamId, reportId);
    if (!report) throw new NotFoundException('Saved weekly report could not be read');
    return report;
  }
}
